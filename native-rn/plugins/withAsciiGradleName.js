const { withSettingsGradle } = require('@expo/config-plugins');

/**
 * Keeps Android app display name localized ('跟夕走' in strings.xml) while enforcing
 * an ASCII-safe Gradle rootProject.name so CMake/NDK build paths never break on non-ASCII chars.
 */
module.exports = function withAsciiGradleName(config, projectName = 'FollowTheTrail') {
  return withSettingsGradle(config, (mod) => {
    if (mod.modResults.language === 'groovy') {
      mod.modResults.contents = mod.modResults.contents.replace(
        /rootProject\.name\s*=\s*['"][^'"]*['"]/,
        `rootProject.name = '${projectName}'`
      );
    }
    return mod;
  });
};
