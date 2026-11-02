const { withPodfile } = require('expo/config-plugins');

const MARKER = 'raise_pod_deployment_targets';

const SNIPPET = `
    # ${MARKER}: Xcode rejects pod targets below iOS 15 (RNSVGFilters is 12.4).
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        minimum = podfile_properties['ios.deploymentTarget'] || '16.4'
        if current.nil? || current.to_f < 15.0
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum
        end
      end
    end
`;

function withIosPodDeploymentTarget(config) {
  return withPodfile(config, (mod) => {
    if (mod.modResults.contents.includes(MARKER)) {
      return mod;
    }

    const pattern = /post_install do \|installer\|/;
    if (!pattern.test(mod.modResults.contents)) {
      throw new Error('withIosPodDeploymentTarget: Podfile has no post_install block');
    }

    mod.modResults.contents = mod.modResults.contents.replace(
      pattern,
      `post_install do |installer|${SNIPPET}`
    );
    return mod;
  });
}

module.exports = withIosPodDeploymentTarget;
