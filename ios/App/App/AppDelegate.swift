import UIKit
import WebKit
import AVFoundation
import AuthenticationServices
import Network
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
        // Sign-in in the in-app system sheet instead of leaving for Safari.
        controller.add(proxy, name: "nativeAuth")
        controller.addUserScript(WKUserScript(
            source: "window.webkit.messageHandlers.nativeShell.postMessage('documentStart')",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        // Watch load failures without replacing Capacitor's navigation delegate.
        if let webView = webView, let inner = webView.navigationDelegate {
            let proxy = NavigationFailureProxy(inner: inner)
            proxy.onFinish = { [weak self] in self?.pageDidLoad() }
            proxy.onFail = { [weak self] error in self?.pageDidFail(error) }
            proxy.onProcessTerminated = { [weak self] in self?.hasLoadedPage = false }
            navigationProxy = proxy
            webView.navigationDelegate = proxy
        }
    }

    // MARK: Offline launch
    //
    // The UI is the remote site: opened without network, the first load failed
    // and the app stayed on a black screen for good (even once back online).
    // Capacitor's `server.errorPath` would also fire on benign cancellations
    // (a navigation superseding another) and break them, hence this overlay,
    // shown only while NO page has loaded yet.

    private var navigationProxy: NavigationFailureProxy?
    private var hasLoadedPage = false
    private var offlineView: UIView?
    private var pathMonitor: NWPathMonitor?

    private func pageDidLoad() {
        hasLoadedPage = true
        hideOffline()
    }

    private func pageDidFail(_ error: Error) {
        let ns = error as NSError
        // Cancelled / superseded / turned-into-download loads aren't outages.
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        if ns.domain == "WebKitErrorDomain" && ns.code == 102 { return }
        // A page is on screen: WebKit keeps showing it, nothing to rescue.
        guard !hasLoadedPage else { return }
        showOffline()
    }

    private func showOffline() {
        guard offlineView == nil else { return }
        let overlay = UIView()
        overlay.backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.04, alpha: 1)
        overlay.translatesAutoresizingMaskIntoConstraints = false

        let icon = UIImageView(image: UIImage(systemName: "wifi.slash"))
        icon.tintColor = UIColor(white: 1, alpha: 0.6)
        icon.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 40, weight: .regular)

        let title = UILabel()
        title.text = "Pas de connexion"
        title.font = .systemFont(ofSize: 20, weight: .semibold)
        title.textColor = .white

        let message = UILabel()
        message.text = "Drivecord a besoin d’Internet. L’app se recharge toute seule dès que le réseau revient."
        message.font = .systemFont(ofSize: 15)
        message.textColor = UIColor(white: 1, alpha: 0.6)
        message.numberOfLines = 0
        message.textAlignment = .center

        let retry = UIButton(type: .system)
        retry.setTitle("Réessayer", for: .normal)
        retry.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        retry.tintColor = UIColor(red: 0.51, green: 0.42, blue: 0.98, alpha: 1.0)
        retry.addTarget(self, action: #selector(retryLoad), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [icon, title, message, retry])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(stack)
        view.addSubview(overlay)
        NSLayoutConstraint.activate([
            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: overlay.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -32),
        ])
        offlineView = overlay

        // Reload by itself as soon as the network is back.
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            DispatchQueue.main.async { self?.retryLoad() }
        }
        monitor.start(queue: DispatchQueue(label: "drivecord.offline-monitor"))
        pathMonitor = monitor
    }

    private func hideOffline() {
        offlineView?.removeFromSuperview()
        offlineView = nil
        pathMonitor?.cancel()
        pathMonitor = nil
    }

    @objc private func retryLoad() {
        guard !hasLoadedPage, let url = bridge?.config.serverURL else { return }
        webView?.load(URLRequest(url: url))
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
        nativeTabBar.overrideUserInterfaceStyle = nativeStyle
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
        case "nativeAuth":
            handleAuthMessage(message.body)
        case "nativeShell":
            if let body = message.body as? [String: Any] {
                if let theme = body["theme"] as? String { applyTheme(theme) }
                // Long jobs (camera-roll backup): auto-lock suspends the web view.
                if let awake = body["keepAwake"] as? Bool {
                    DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = awake }
                }
            } else {
                handleDocumentStart()
            }
        default:
            break
        }
    }

    // MARK: Sign-in sheet
    //
    // Cord / Google / Discord / passkey sign-in runs in ASWebAuthenticationSession
    // — the system sheet over the app (« Drivecord souhaite utiliser
    // drivecord.app pour se connecter ») — instead of switching to Safari. It
    // shares Safari's cookies and passkeys, and the drivecord://auth?code=…
    // ending the flow comes straight back to this session: no app switch, and
    // no other app registering drivecord:// can catch it.

    private var authSession: ASWebAuthenticationSession?

    private func handleAuthMessage(_ raw: Any) {
        DispatchQueue.main.async {
            guard let body = raw as? [String: Any],
                  let string = body["url"] as? String,
                  let url = URL(string: string),
                  url.scheme == "https",
                  // Any page shown in the web view can post here: only our site.
                  url.host == self.bridge?.config.serverURL.host else { return }

            self.authSession?.cancel()
            let completion: (URL?, Error?) -> Void = { [weak self] callbackURL, _ in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    self.authSession = nil
                    // null = closed / cancelled by the user.
                    let arg = callbackURL.map { self.jsString($0.absoluteString) } ?? "null"
                    self.webView?.evaluateJavaScript(
                        "window.__drivecordAuthCallback && window.__drivecordAuthCallback(\(arg))",
                        completionHandler: nil
                    )
                }
            }
            let session: ASWebAuthenticationSession
            if #available(iOS 17.4, *) {
                session = ASWebAuthenticationSession(url: url, callback: .customScheme("drivecord"), completionHandler: completion)
            } else {
                session = ASWebAuthenticationSession(url: url, callbackURLScheme: "drivecord", completionHandler: completion)
            }
            session.presentationContextProvider = self
            // Shared with Safari: Cord / Google already signed in there stay so.
            session.prefersEphemeralWebBrowserSession = false
            self.authSession = session
            if !session.start() { completion(nil, nil) }
        }
    }

    // Follow the web app's theme ("light", or a dark one) rather than the
    // phone's appearance: the app is dark by default, so on an iPhone in light
    // mode the status bar text was black on black, and the tab bar, sheets and
    // menus came up light over a dark app.
    // Only the NATIVE pieces get the style — overriding the web view (or the
    // window) would also change its prefers-color-scheme and lock the app's
    // « Système » theme to dark.
    private var nativeStyle: UIUserInterfaceStyle = .dark

    private func applyTheme(_ theme: String) {
        DispatchQueue.main.async {
            let light = theme == "light"
            self.nativeStyle = light ? .light : .dark
            self.nativeTabBar.overrideUserInterfaceStyle = self.nativeStyle
            for (_, btn) in self.anchorButtons { btn.overrideUserInterfaceStyle = self.nativeStyle }
            self.statusBarStyle = light ? .darkContent : .lightContent
            self.setNeedsStatusBarAppearanceUpdate()
        }
    }

    // Before the page reports its theme: match the dark launch background.
    override func setStatusBarDefaults() {
        super.setStatusBarDefaults()
        statusBarStyle = .lightContent
    }

    // A new document replaced the page (reload, logout, OAuth exchange…). React
    // cleanups never ran, so the anchored overlays of the old page would stay on
    // screen as invisible buttons swallowing taps: drop them all.
    private func handleDocumentStart() {
        DispatchQueue.main.async {
            for (_, btn) in self.anchorButtons { btn.removeFromSuperview() }
            self.anchorButtons.removeAll()
            // A reload mid-backup never sends keepAwake: false.
            UIApplication.shared.isIdleTimerDisabled = false
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
            btn.overrideUserInterfaceStyle = self.nativeStyle
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
            alert.overrideUserInterfaceStyle = self.nativeStyle
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

extension MainViewController: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        view.window ?? ASPresentationAnchor()
    }
}

/// Sits in front of Capacitor's navigation delegate to observe load results;
/// every call (handled here or not) still reaches Capacitor.
private final class NavigationFailureProxy: NSObject, WKNavigationDelegate {
    private weak var inner: WKNavigationDelegate?
    var onFinish: (() -> Void)?
    var onFail: ((Error) -> Void)?
    var onProcessTerminated: (() -> Void)?

    init(inner: WKNavigationDelegate) {
        self.inner = inner
    }

    // Methods not implemented here go straight to Capacitor's handler.
    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (inner?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        (inner?.responds(to: aSelector) ?? false) ? inner : nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        inner?.webView?(webView, didFinish: navigation)
        onFinish?()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        inner?.webView?(webView, didFail: navigation, withError: error)
        onFail?(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        inner?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        onFail?(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        onProcessTerminated?()
        inner?.webViewWebContentProcessDidTerminate?(webView)
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
        // The web app's audio player (with lock-screen controls via Media
        // Session) stopped as soon as the phone locked: background audio needs
        // the "audio" background mode (Info.plist) and a playback session.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
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
