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
class MainViewController: CAPBridgeViewController, UITabBarDelegate, WKScriptMessageHandler {

    private let nativeTabBar = UITabBar()
    private let routes = ["/drive", "/drive?section=vault", "/backup", "/shares", "/settings"]
    private let tabDefs: [(title: String, symbol: String)] = [
        ("Fichiers", "folder.fill"),
        ("Coffre", "lock.fill"),
        ("Pellicule", "photo.on.rectangle"),
        ("Partagés", "link"),
        ("Réglages", "gearshape.fill"),
    ]
    private var lastBarHeight: CGFloat = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        setupTabBar()
        // Receive selected-tab / visibility updates from the web app.
        webView?.configuration.userContentController.add(self, name: "nativeTabs")
    }

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
        // Tell the web the bar's pixel height so content can clear it.
        let h = nativeTabBar.frame.height
        if h > 0 && abs(h - lastBarHeight) > 0.5 {
            lastBarHeight = h
            webView?.evaluateJavaScript(
                "document.documentElement.style.setProperty('--native-tabbar-h','\(Int(h))px')",
                completionHandler: nil
            )
        }
    }

    // Tab tapped → navigate the web app (client-side route, no reload).
    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        let i = item.tag
        guard i >= 0 && i < routes.count else { return }
        let path = routes[i]
        let js = "if(window.__drivecordNavigate){window.__drivecordNavigate('\(path)')}else{window.location.href='\(path)'}"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    // Web → native: keep the selected tab + visibility in sync with the route.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "nativeTabs" else { return }
        DispatchQueue.main.async {
            guard let body = message.body as? [String: Any] else { return }
            if let visible = body["visible"] as? Bool {
                self.nativeTabBar.isHidden = !visible
            }
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

}
