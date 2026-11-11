import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var privacyShieldView: UIView?
    private var isScreenRecordingActive = false
    private var isAppInBackground = false
    private var isProtectionConfigured = false
    private var secureTextField: UITextField?
    private var resignActiveWorkItem: DispatchWorkItem?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 1. Setup Screen Recording, Screenshot, and Media/Window Observers
        setupScreenProtection()
        setupMediaAndWindowObservers()
        
        // 2. Setup iOS Hardware Secure Layer (hardware-level blank out for screenshots & recordings across normal & in-app views)
        DispatchQueue.main.async { [weak self] in
            self?.makeWindowSecure()
        }
        return true
    }

    // MARK: - Hardware Secure Window Layer

    /// Embeds the root view into iOS secure text field container.
    /// In iOS, `isSecureTextEntry = true` instructs the OS rendering pipeline (RenderServer)
    /// to blank out the view when captured by screenshots, screen recordings, or AirPlay.
    private func makeWindowSecure() {
        guard let window = self.window, !isProtectionConfigured else { return }
        
        let field = UITextField()
        field.isSecureTextEntry = true
        field.isUserInteractionEnabled = false
        field.translatesAutoresizingMaskIntoConstraints = false
        
        window.addSubview(field)
        field.centerXAnchor.constraint(equalTo: window.centerXAnchor).isActive = true
        field.centerYAnchor.constraint(equalTo: window.centerYAnchor).isActive = true
        
        window.layer.superlayer?.addSublayer(field.layer)
        if let secureLayer = field.layer.sublayers?.first {
            secureLayer.addSublayer(window.layer)
            self.secureTextField = field
            self.isProtectionConfigured = true
            NSLog("[ScreenProtection] iOS Hardware Secure Layer activated via CALayer reparenting")
        } else if let secureContainer = field.subviews.first {
            secureContainer.addSubview(window)
            self.secureTextField = field
            self.isProtectionConfigured = true
            NSLog("[ScreenProtection] iOS Hardware Secure Layer activated via subview container")
        }
    }

    // MARK: - Screen Protection Setup

    private func setupScreenProtection() {
        // 1. Listen for Screen Recording / AirPlay capture changes globally
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleScreenCaptureChange),
            name: UIScreen.capturedDidChangeNotification,
            object: nil
        )

        // 2. Listen for Screenshot events globally (all views & players)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleUserDidTakeScreenshot),
            name: UIApplication.userDidTakeScreenshotNotification,
            object: nil
        )

        // Check initial capture status on launch with delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            let isCaptured = UIScreen.main.isCaptured
            NSLog("[ScreenProtection] Launch initial capture check: \(isCaptured)")
            if isCaptured {
                self?.handleScreenCaptureChange()
            } else {
                self?.hidePrivacyShield()
            }
        }
    }

    private func setupMediaAndWindowObservers() {
        // Observers to detect when fullscreen video player or new window is presented / dismissed
        let nc = NotificationCenter.default
        
        nc.addObserver(
            self,
            selector: #selector(handleWindowOrMediaStateChange),
            name: UIWindow.didBecomeVisibleNotification,
            object: nil
        )
        nc.addObserver(
            self,
            selector: #selector(handleWindowOrMediaStateChange),
            name: UIWindow.didBecomeKeyNotification,
            object: nil
        )
        nc.addObserver(
            self,
            selector: #selector(handleWindowOrMediaStateChange),
            name: UIWindow.didBecomeHiddenNotification,
            object: nil
        )
        nc.addObserver(
            self,
            selector: #selector(handleWindowOrMediaStateChange),
            name: NSNotification.Name("UIMoviePlayerControllerDidEnterFullscreenNotification"),
            object: nil
        )
        nc.addObserver(
            self,
            selector: #selector(handleWindowOrMediaStateChange),
            name: NSNotification.Name("UIMoviePlayerControllerDidExitFullscreenNotification"),
            object: nil
        )
        nc.addObserver(
            self,
            selector: #selector(handleWindowOrMediaStateChange),
            name: NSNotification.Name("AVPlayerItemBecameCurrentNotification"),
            object: nil
        )
    }

    @objc private func handleWindowOrMediaStateChange(_ notification: Notification) {
        NSLog("[ScreenProtection] Window/Media state change detected: \(notification.name.rawValue)")
        // When fullscreen video opens or closes, make sure no leftover privacy shield covers it if not capturing
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if !UIScreen.main.isCaptured && !self.isAppInBackground {
                self.resignActiveWorkItem?.cancel()
                self.resignActiveWorkItem = nil
                self.hidePrivacyShield()
            }
        }
    }

    // MARK: - Capture & Screenshot Handlers

    @objc private func handleScreenCaptureChange() {
        let isCaptured = UIScreen.main.isCaptured
        NSLog("[ScreenProtection] handleScreenCaptureChange triggered. isCaptured: \(isCaptured)")
        
        if isCaptured {
            // Guard against momentary glitch, re-verify and enforce shield
            self.isScreenRecordingActive = true
            self.showPrivacyShield(message: "⚠️ تم تعطيل العرض بسبب تشغيل تسجيل الشاشة أو البث\nScreen recording is strictly prohibited", isPersistent: true)
            
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                let currentCaptured = UIScreen.main.isCaptured
                NSLog("[ScreenProtection] handleScreenCaptureChange re-check (0.3s): \(currentCaptured)")
                if currentCaptured {
                    self?.isScreenRecordingActive = true
                    self?.showPrivacyShield(message: "⚠️ تم تعطيل العرض بسبب تشغيل تسجيل الشاشة أو البث\nScreen recording is strictly prohibited", isPersistent: true)
                } else {
                    self?.isScreenRecordingActive = false
                    self?.hidePrivacyShield()
                }
            }
        } else {
            self.isScreenRecordingActive = false
            hidePrivacyShield()
        }
    }

    @objc private func handleUserDidTakeScreenshot() {
        NSLog("[ScreenProtection] User took screenshot notification received")
        // Flash privacy warning on screenshot attempt anywhere in the app
        showPrivacyShield(message: "⚠️ تحذير أمني: التقاط لقطة شاشة محظور لحماية المحتوى\nScreenshots are forbidden", isPersistent: false)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            guard let self = self else { return }
            if !UIScreen.main.isCaptured && !self.isAppInBackground {
                self.hidePrivacyShield()
            }
        }
    }

    // MARK: - Window Helpers

    private var allAppWindows: [UIWindow] {
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
    }

    private var activeKeyWindow: UIWindow? {
        if let window = self.window { return window }
        return allAppWindows.first(where: { $0.isKeyWindow }) ?? allAppWindows.first
    }

    // MARK: - Privacy Shield UI

    private func showPrivacyShield(message: String = "⚠️ حماية المحتوى مفعلة", isPersistent: Bool = false) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let targetWindow = self.activeKeyWindow else {
                NSLog("[ScreenProtection] showPrivacyShield aborted — no valid window found")
                return
            }
            
            NSLog("[ScreenProtection] showPrivacyShield called: \(message)")
            
            if self.privacyShieldView == nil {
                let shield = UIView(frame: targetWindow.bounds)
                shield.backgroundColor = UIColor(red: 0.05, green: 0.07, blue: 0.12, alpha: 1.0)
                shield.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                
                let stack = UIStackView()
                stack.axis = .vertical
                stack.spacing = 16
                stack.alignment = .center
                stack.translatesAutoresizingMaskIntoConstraints = false
                
                let iconLabel = UILabel()
                iconLabel.text = "🛡️"
                iconLabel.font = UIFont.systemFont(ofSize: 52)
                
                let titleLabel = UILabel()
                titleLabel.tag = 99998
                titleLabel.text = message
                titleLabel.textColor = .white
                titleLabel.font = UIFont.boldSystemFont(ofSize: 16)
                titleLabel.textAlignment = .center
                titleLabel.numberOfLines = 0
                
                stack.addArrangedSubview(iconLabel)
                stack.addArrangedSubview(titleLabel)
                
                shield.addSubview(stack)
                NSLayoutConstraint.activate([
                    stack.centerXAnchor.constraint(equalTo: shield.centerXAnchor),
                    stack.centerYAnchor.constraint(equalTo: shield.centerYAnchor),
                    stack.leadingAnchor.constraint(greaterThanOrEqualTo: shield.leadingAnchor, constant: 32),
                    stack.trailingAnchor.constraint(lessThanOrEqualTo: shield.trailingAnchor, constant: -32)
                ])
                
                shield.tag = 99999
                self.privacyShieldView = shield
                targetWindow.addSubview(shield)
                targetWindow.bringSubviewToFront(shield)
            } else {
                if let label = self.privacyShieldView?.viewWithTag(99998) as? UILabel {
                    label.text = message
                }
                self.privacyShieldView?.isHidden = false
                targetWindow.bringSubviewToFront(self.privacyShieldView!)
            }
            
            // Fallback watchdog timer for non-persistent shields or transient glitches
            if !isPersistent {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
                    guard let self = self else { return }
                    if !UIScreen.main.isCaptured && !self.isAppInBackground {
                        self.hidePrivacyShield()
                    }
                }
            }
        }
    }

    private func hidePrivacyShield() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            NSLog("[ScreenProtection] hidePrivacyShield called")
            
            // Remove instance reference
            self.privacyShieldView?.removeFromSuperview()
            self.privacyShieldView = nil
            
            // Safety scan across all scene windows to guarantee no leftover view with tag 99999
            for window in self.allAppWindows {
                if let strayShield = window.viewWithTag(99999) {
                    strayShield.removeFromSuperview()
                }
            }
        }
    }

    // MARK: - App Lifecycle

    func applicationWillResignActive(_ application: UIApplication) {
        NSLog("[ScreenProtection] applicationWillResignActive called. isCaptured: \(UIScreen.main.isCaptured)")
        
        // If real screen capture is active, display shield immediately
        if UIScreen.main.isCaptured {
            showPrivacyShield(message: "⚠️ تم تعطيل العرض بسبب تشغيل تسجيل الشاشة أو البث\nScreen recording is strictly prohibited", isPersistent: true)
            return
        }

        // Cancel any pending work item
        resignActiveWorkItem?.cancel()
        
        // Debounce privacy shield for app-switcher.
        // Fullscreen video presentation, rotation, and alerts cause brief resignActive transitions
        // without entering background. We only show the shield if the app genuinely enters background.
        let workItem = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            if self.isAppInBackground {
                self.showPrivacyShield(message: "منصة المعرفة التعليمية\nAl-Marfa Platform", isPersistent: true)
            }
        }
        self.resignActiveWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: workItem)
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        NSLog("[ScreenProtection] applicationDidEnterBackground called")
        isAppInBackground = true
        showPrivacyShield(message: "منصة المعرفة التعليمية\nAl-Marfa Platform", isPersistent: true)
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        NSLog("[ScreenProtection] applicationWillEnterForeground called")
        isAppInBackground = false
        resignActiveWorkItem?.cancel()
        resignActiveWorkItem = nil
        if !UIScreen.main.isCaptured {
            hidePrivacyShield()
        }
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        let isCaptured = UIScreen.main.isCaptured
        NSLog("[ScreenProtection] applicationDidBecomeActive called. isCaptured: \(isCaptured)")
        isAppInBackground = false
        resignActiveWorkItem?.cancel()
        resignActiveWorkItem = nil
        
        if !isCaptured {
            hidePrivacyShield()
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                let recheckCaptured = UIScreen.main.isCaptured
                NSLog("[ScreenProtection] applicationDidBecomeActive re-check: \(recheckCaptured)")
                if !recheckCaptured {
                    self?.hidePrivacyShield()
                }
            }
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}


