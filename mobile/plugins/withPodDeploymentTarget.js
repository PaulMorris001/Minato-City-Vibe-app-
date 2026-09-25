const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

/** Must stay >= the `platform :ios` floor the Expo Podfile template sets. */
const DEPLOYMENT_TARGET = "15.1";

const SENTINEL = "# withPodDeploymentTarget";

const LOOP = `
    ${SENTINEL}: Xcode 26+ refuses to build anything below iOS 15.0, and a lot
    # of pods still declare 9.0–13.4 on their RESOURCE BUNDLE targets — which
    # neither \`platform :ios\` nor react_native_post_install reaches, so those
    # are the ones that fail. Raise only; never lower a pod that wants more.
    bump_deployment_target = lambda do |project|
      project.targets.each do |target|
        target.build_configurations.each do |build_config|
          current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
          if current.nil? || current.to_f < ${DEPLOYMENT_TARGET}
            build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${DEPLOYMENT_TARGET}'
          end
        end
      end
    end

    bump_deployment_target.call(installer.pods_project)
    # CocoaPods splits pods across several projects when multi-project
    # generation is on; pods_project alone misses those.
    installer.generated_projects.each { |project| bump_deployment_target.call(project) }
`;

/**
 * Forces every CocoaPods target up to iOS ${DEPLOYMENT_TARGET}.
 *
 * `ios/` is gitignored regenerated output, so editing the Podfile by hand is
 * undone by the next prebuild — this re-applies it every time. expo-build-
 * properties' `ios.deploymentTarget` does NOT cover this: it only rewrites the
 * app target and the Podfile's `platform` line.
 */
module.exports = function withPodDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      let podfile = fs.readFileSync(podfilePath, "utf8");

      if (podfile.includes(SENTINEL)) return config;

      // After react_native_post_install, so RN's own pass can't undo this.
      const rnPostInstall = /^[ \t]*react_native_post_install\([\s\S]*?\n[ \t]*\)\n/m;
      if (rnPostInstall.test(podfile)) {
        podfile = podfile.replace(rnPostInstall, (match) => match + LOOP);
      } else {
        podfile = podfile.replace(/^([ \t]*post_install do \|installer\|)$/m, `$1\n${LOOP}`);
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
