// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.0"),
        .package(name: "CapacitorApp", path: "../../../../../node_modules/.bun/@capacitor+app@8.1.0+1b808583819c2ac6/node_modules/@capacitor/app"),
        .package(name: "CapacitorBrowser", path: "../../../../../node_modules/.bun/@capacitor+browser@8.0.3+1b808583819c2ac6/node_modules/@capacitor/browser"),
        .package(name: "CapacitorCamera", path: "../../../../../node_modules/.bun/@capacitor+camera@8.2.0+1b808583819c2ac6/node_modules/@capacitor/camera"),
        .package(name: "CapacitorDevice", path: "../../../../../node_modules/.bun/@capacitor+device@8.0.2+1b808583819c2ac6/node_modules/@capacitor/device"),
        .package(name: "CapacitorGeolocation", path: "../../../../../node_modules/.bun/@capacitor+geolocation@8.2.0+1b808583819c2ac6/node_modules/@capacitor/geolocation"),
        .package(name: "CapacitorHaptics", path: "../../../../../node_modules/.bun/@capacitor+haptics@8.0.2+1b808583819c2ac6/node_modules/@capacitor/haptics"),
        .package(name: "CapacitorKeyboard", path: "../../../../../node_modules/.bun/@capacitor+keyboard@8.0.3+1b808583819c2ac6/node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorPreferences", path: "../../../../../node_modules/.bun/@capacitor+preferences@8.0.1+1b808583819c2ac6/node_modules/@capacitor/preferences"),
        .package(name: "CapacitorPluginSafeArea", path: "../../../../../node_modules/.bun/capacitor-plugin-safe-area@5.0.0+1b808583819c2ac6/node_modules/capacitor-plugin-safe-area")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorBrowser", package: "CapacitorBrowser"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorDevice", package: "CapacitorDevice"),
                .product(name: "CapacitorGeolocation", package: "CapacitorGeolocation"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences"),
                .product(name: "CapacitorPluginSafeArea", package: "CapacitorPluginSafeArea")
            ]
        )
    ]
)
