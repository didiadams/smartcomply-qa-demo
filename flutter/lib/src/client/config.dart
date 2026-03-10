/// SDK environment selection.
enum Environment { sandbox, production }

/// Configuration for the SmartComply SDK.
class SDKConfig {
  final String apiKey;
  final Environment environment;

  /// HTTP request timeout. Defaults to 15 seconds.
  final Duration timeout;

  const SDKConfig({
    required this.apiKey,
    this.environment = Environment.sandbox,
    this.timeout = const Duration(seconds: 15),
  });
}

/// Base URLs for each environment.
const Map<Environment, String> kBaseUrls = {
  Environment.sandbox:
      'http://10.0.2.2:8000', // Android emulator → your PC's localhost
  Environment.production: 'https://api.smartcomply.com',
};
