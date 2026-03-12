/// SDK environment selection.
enum Environment { sandbox, production }

/// Configuration for the SmartComply Flutter SDK.
///
/// - [apiKey]: Bearer token issued by SmartComply. Sent in the
///   `Authorization` header when creating a session.
/// - [clientId]: UUID of the SDK config record tied to your account/branch.
///   Required by the backend to look up your settings on session creation.
/// - [environment]: Defaults to [Environment.sandbox].
/// - [timeout]: HTTP request timeout. Defaults to 15 seconds.
class SDKConfig {
  final String apiKey;
  final String
      clientId; // UUID string e.g. "3fa85f64-5717-4562-b3fc-2c963f66afa6"
  final Environment environment;
  final Duration timeout;

  const SDKConfig({
    required this.apiKey,
    required this.clientId,
    this.environment = Environment.sandbox,
    this.timeout = const Duration(seconds: 15),
  });
}

/// Base URLs for each environment.
const Map<Environment, String> kBaseUrls = {
  Environment.sandbox: 'http://10.0.2.2:8000', // Android emulator → your PC
  Environment.production: 'https://adhere-api.smartcomply.com',
};
