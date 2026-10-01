import UIKit
import WebKit
import Capacitor

// MARK: - Native Liquid Glass tab bar
//
// The app loads the remote web UI in a single Capacitor WKWebView. To get the
// *real* iOS 26 Liquid Glass (which CSS in a WebView can only fake), the bottom
// navigation is a native UITabBar overlaid on the full-screen web view. On
// iOS 26 a standard translucent UITabBar adopts the system Liquid Glass
// material automatically; on older iOS it falls back to the classic blur.
//
// Contract with the web app (src/components/native-tabs-bridge.tsx):
//   • UA carries "DrivecordNative" so the web hides its CSS tab bar.
//   • Native → web (tab tapped):  window.__drivecordNavigate(path)
//   • Web → native (route change): webkit.messageHandlers.nativeTabs.postMessage
//        ({ index: Int, visible: Bool })
//   • Native pushes the measured bar height to CSS var --native-tabbar-h so the
//     web content reserves room (it scrolls *behind* the translucent bar).
//     It is re-sent on every new document (nativeShell "documentStart").
class MainViewController: CAPBridgeViewController, UITabBarDelegate, WKScriptMessageHandler {

    private let nativeTabBar = UITabBar()
    private let routes = ["/drive", "/drive?section=vault", "/backup", "/approve", "/settings"]
    private let tabDefs: [(title: String, symbol: String)] = [
        ("Fichiers", "folder.fill"),
        ("Coffre", "lock.fill"),
        ("Pellicule", "photo.on.rectangle"),
        ("Approuver", "checkmark.shield.fill"),
        ("Réglages", "gearshape.fill"),
    ]
    private var lastBarHeight: CGFloat = 0

    // WKWebView silently drops window.open() unless it runs inside a direct tap.
    // The Cord / OAuth / passkey flows call window.open(url, "_system") from an
    // effect (/login?via=cord) or after an await, so without this the system
    // browser never opened. Capacitor routes the new window to Safari.
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        return config
    }

    // Called before the first page load, so the handlers exist when the web app
    // boots. A weak proxy avoids WKUserContentController retaining self.
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let controller = webView?.configuration.userContentController else { return }
        let proxy = WeakScriptMessageHandler(self)
        // Selected-tab / visibility updates from the web app.
        controller.add(proxy, name: "nativeTabs")
        // Requests to present native (Liquid Glass) action sheets.
        controller.add(proxy, name: "nativeMenu")
        // Requests to anchor native pull-down menus to web buttons.
        controller.add(proxy, name: "nativeAnchorMenu")
        // Signals each new document (full load / reload), see handleDocumentStart.
        controller.add(proxy, name: "nativeShell")
        controller.addUserScript(WKUserScript(
            source: "window.webkit.messageHandlers.nativeShell.postMessage('documentStart')",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupTabBar()
    }

    // Transparent native buttons overlaid on web trigger buttons; each hosts a
    // UIMenu so tapping shows the real iOS Liquid Glass pull-down, anchored in
    // place (top bar etc.) instead of a bottom action sheet.
    private var anchorButtons: [String: UIButton] = [:]

    private func setupTabBar() {
        nativeTabBar.delegate = self
        nativeTabBar.translatesAutoresizingMaskIntoConstraints = false
        // App accent (indigo) for the selected tab.
        nativeTabBar.tintColor = UIColor(red: 0.51, green: 0.42, blue: 0.98, alpha: 1.0)
        var items: [UITabBarItem] = []
        for (i, def) in tabDefs.enumerated() {
            items.append(UITabBarItem(title: def.title, image: UIImage(systemName: def.symbol), tag: i))
        }
        nativeTabBar.setItems(items, animated: false)
        nativeTabBar.selectedItem = items.first
        // Hidden until the web app says the current page wants it: the first
        // page is often /login or the welcome screen, where the bar used to sit
        // on top of the sign-in UI until hydration.
        nativeTabBar.isHidden = true
        view.addSubview(nativeTabBar)
        NSLayoutConstraint.activate([
            nativeTabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            nativeTabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            nativeTabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        view.bringSubviewToFront(nativeTabBar)
        // Tell the web how much room to reserve at the bottom. On iOS 26 the
        // floating "Liquid Glass" tab bar reports a short frame height while
        // sitting above the home indicator, so measure from the bar's top edge
        // down to the very bottom of the view (covers the bar + any gap + safe
        // area) instead of trusting frame.height alone.
        let h = max(nativeTabBar.frame.height, view.bounds.maxY - nativeTabBar.frame.minY)
        if h > 0 && abs(h - lastBarHeight) > 0.5 {
            lastBarHeight = h
            pushBarHeight()
        }
    }

    // The CSS var lives on the current document, so it is lost on every full
    // load. The first layout pass also runs before the remote page exists, so
    // re-send it whenever a document starts (and when the web reports a route).
    private func pushBarHeight() {
        guard lastBarHeight > 0 else { return }
        let value = jsString("\(Int(lastBarHeight))px")
        let js = """
        (function(){var s=function(){document.documentElement.style.setProperty('--native-tabbar-h',\(value))};\
        if(document.documentElement){s()}else{document.addEventListener('DOMContentLoaded',s,{once:true})}})()
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    // Tab tapped → navigate the web app (client-side route, no reload).
    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        let i = item.tag
        guard i >= 0 && i < routes.count else { return }
        let path = jsString(routes[i])
        let js = "if(window.__drivecordNavigate){window.__drivecordNavigate(\(path))}else{window.location.href=\(path)}"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    // Web → native messages.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "nativeTabs":
            handleTabsMessage(message.body)
        case "nativeMenu":
            handleMenuMessage(message.body)
        case "nativeAnchorMenu":
            handleAnchorMenuMessage(message.body)
        case "nativeShell":
            handleDocumentStart()
        default:
            break
        }
    }

    // A new document replaced the page (reload, logout, OAuth exchange…). React
    // cleanups never ran, so the anchored overlays of the old page would stay on
    // screen as invisible buttons swallowing taps: drop them all.
    private func handleDocumentStart() {
        DispatchQueue.main.async {
            for (_, btn) in self.anchorButtons { btn.removeFromSuperview() }
            self.anchorButtons.removeAll()
            self.pushBarHeight()
        }
    }

    // Create/update/remove a native pull-down menu anchored to a web rect.
    private func handleAnchorMenuMessage(_ raw: Any) {
        DispatchQueue.main.async {
            guard let body = raw as? [String: Any], let id = body["id"] as? String else { return }

            if (body["remove"] as? Bool) == true {
                self.anchorButtons[id]?.removeFromSuperview()
                self.anchorButtons.removeValue(forKey: id)
                return
            }

            guard let items = body["items"] as? [[String: Any]],
                  let r = body["rect"] as? [String: Any],
                  let x = (r["x"] as? NSNumber)?.doubleValue,
                  let y = (r["y"] as? NSNumber)?.doubleValue,
                  let w = (r["width"] as? NSNumber)?.doubleValue,
                  let h = (r["height"] as? NSNumber)?.doubleValue else { return }

            let title = (body["title"] as? String) ?? ""
            let frame = CGRect(x: x, y: y, width: w, height: h)

            let btn: UIButton
            if let existing = self.anchorButtons[id] {
                btn = existing
            } else {
                btn = UIButton(type: .custom)
                btn.backgroundColor = .clear
                self.view.addSubview(btn)
                self.anchorButtons[id] = btn
            }
            btn.frame = frame
            btn.accessibilityLabel = title.isEmpty ? "Menu" : title

            var actions: [UIAction] = []
            for (i, it) in items.enumerated() {
                let label = (it["label"] as? String) ?? ""
                let selected = (it["selected"] as? Bool) ?? false
                let destructive = (it["destructive"] as? Bool) ?? false
                let action = UIAction(
                    title: label,
                    attributes: destructive ? .destructive : [],
                    state: selected ? .on : .off
                ) { [weak self] _ in
                    self?.reportMenuResult(id, i)
                }
                actions.append(action)
            }
            btn.menu = UIMenu(title: title, children: actions)
            btn.showsMenuAsPrimaryAction = true
            self.view.bringSubviewToFront(btn)
        }
    }

    // Keep the selected tab + visibility in sync with the web route.
    private func handleTabsMessage(_ raw: Any) {
        DispatchQueue.main.async {
            guard let body = raw as? [String: Any] else { return }
            if let visible = body["visible"] as? Bool {
                self.nativeTabBar.isHidden = !visible
            }
            // The web posts this on mount too: make sure the page has the height.
            self.pushBarHeight()
            if let index = body["index"] as? Int {
                let items = self.nativeTabBar.items
                if index >= 0, let items = items, index < items.count {
                    self.nativeTabBar.selectedItem = items[index]
                } else {
                    self.nativeTabBar.selectedItem = nil
                }
            }
        }
    }

    // Present a native (Liquid Glass) action sheet and report the choice back.
    private func handleMenuMessage(_ raw: Any) {
        DispatchQueue.main.async {
            guard let body = raw as? [String: Any],
                  let id = body["id"] as? String,
                  let items = body["items"] as? [[String: Any]] else { return }
            let title = body["title"] as? String
            let messageText = body["message"] as? String
            let cancel = (body["cancel"] as? String) ?? "Annuler"

            let alert = UIAlertController(title: title, message: messageText, preferredStyle: .actionSheet)
            for (i, it) in items.enumerated() {
                let selected = (it["selected"] as? Bool) ?? false
                let label = ((it["label"] as? String) ?? "")
                let title = selected ? "✓ \(label)" : label
                let style: UIAlertAction.Style = ((it["destructive"] as? Bool) ?? false) ? .destructive : .default
                alert.addAction(UIAlertAction(title: title, style: style) { _ in
                    self.reportMenuResult(id, i)
                })
            }
            alert.addAction(UIAlertAction(title: cancel, style: .cancel) { _ in
                self.reportMenuResult(id, -1)
            })
            // iPad / popover safety — anchor to the bottom centre.
            if let pop = alert.popoverPresentationController {
                pop.sourceView = self.view
                pop.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.maxY - 80, width: 1, height: 1)
                pop.permittedArrowDirections = []
            }
            // Don't stack sheets on top of an existing presentation.
            if self.presentedViewController == nil {
                self.present(alert, animated: true)
            } else {
                self.reportMenuResult(id, -1)
            }
        }
    }

    private func reportMenuResult(_ id: String, _ index: Int) {
        webView?.evaluateJavaScript(
            "window.__drivecordMenuResult && window.__drivecordMenuResult(\(jsString(id)), \(index))",
            completionHandler: nil
        )
    }

    /// A string as a JS literal (quotes, backslashes, newlines escaped). Values
    /// sent by the page must never be spliced raw into evaluated JavaScript.
    private func jsString(_ s: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: s, options: .fragmentsAllowed),
              let literal = String(data: data, encoding: .utf8) else { return "\"\"" }
        return literal
    }
}

/// Forwards script messages without WKUserContentController retaining the
/// view controller (it holds its handlers strongly).
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Push notifications (APNs → plugin Capacitor PushNotifications)
    // Relaie l'enregistrement APNs au plugin ; requis pour que le web reçoive
    // l'événement "registration" avec le jeton d'appareil.

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
