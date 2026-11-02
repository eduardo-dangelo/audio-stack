const fs = require('fs');
const path = require('path');

const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const WINDOW_STARTUP = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

const SCENE_DELEGATE = `import React
import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory,
          appDelegate.window == nil
    else {
      return
    }

    var launchOptions = appDelegate.launchOptions ?? [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }

    let window = UIWindow(windowScene: windowScene)
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions
    )
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = RCTLinkingManager.application(
        UIApplication.shared,
        open: context.url,
        options: [:]
      )
    }
  }
}
`;

function ensureLaunchOptionsProperty(contents) {
  if (contents.includes('var launchOptions:')) {
    return contents;
  }
  const anchor = 'var window: UIWindow?';
  if (!contents.includes(anchor)) {
    throw new Error('withIosSceneLifecycle: AppDelegate is missing window property');
  }
  return contents.replace(
    anchor,
    `${anchor}\n\n  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?`
  );
}

function moveStartupToScene(contents) {
  if (!contents.includes('UIWindow(frame: UIScreen.main.bounds)')) {
    if (!contents.includes('self.launchOptions = launchOptions')) {
      throw new Error('withIosSceneLifecycle: AppDelegate no longer stores launchOptions');
    }
    return contents;
  }
  if (!contents.includes(WINDOW_STARTUP)) {
    throw new Error('withIosSceneLifecycle: AppDelegate window startup block did not match');
  }
  return contents.replace(WINDOW_STARTUP, '    self.launchOptions = launchOptions');
}

function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return mod;
  });

  config = withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('withIosSceneLifecycle: expected a Swift AppDelegate');
    }
    let contents = ensureLaunchOptionsProperty(mod.modResults.contents);
    contents = moveStartupToScene(contents);
    mod.modResults.contents = contents;
    return mod;
  });

  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
      const filePath = path.join(
        mod.modRequest.platformProjectRoot,
        projectName,
        'SceneDelegate.swift'
      );
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, SCENE_DELEGATE);
      return mod;
    },
  ]);

  config = withXcodeProject(config, (mod) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    mod.modResults = IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${projectName}/SceneDelegate.swift`,
      groupName: projectName,
      project: mod.modResults,
      verbose: true,
    });
    return mod;
  });

  return config;
}

module.exports = withIosSceneLifecycle;
