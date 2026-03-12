import 'http_client.dart';
import 'config.dart';
import '../modules/onboarding/onboarding_module.dart';
import '../modules/liveness/liveness_module.dart';
import '../types/onboarding.dart';
import '../types/liveness.dart';

/// The primary entry point for the SmartComply Flutter SDK.
///
/// Usage:
/// ```dart
/// final sdk = SmartComply(SDKConfig(
///   apiKey: 'your_api_key',
///   clientId: 'your-client-uuid',
///   environment: Environment.production,
/// ));
///
/// await sdk.createSession();
/// final identity = await sdk.onboarding.verify(...);
/// final liveness = await sdk.liveness.startCheck(context, ...);
/// ```
class SmartComply {
  final HttpClient _http;
  final String _clientId;
  String? _sessionToken;

  late final OnboardingModule onboarding;
  late final LivenessModule liveness;

  SmartComply(SDKConfig config)
      : _http = HttpClient(config),
        _clientId = config.clientId {
    if (config.apiKey.isEmpty) {
      throw ArgumentError('SmartComply: apiKey is required');
    }
    if (config.clientId.isEmpty) {
      throw ArgumentError('SmartComply: clientId is required');
    }
    onboarding = OnboardingModule(_http);
    liveness = LivenessModule(_http);
  }

  /// The active session token, or null if [createSession] has not been called.
  String? get sessionToken => _sessionToken;

  /// Creates a new verification session.
  ///
  /// Uses the [apiKey] for this one call. After success, all subsequent
  /// SDK requests automatically use the returned session token.
  Future<SessionResponse> createSession() async {
    // Session creation must use the API key, not a session token
    final response = await _http.request<SessionResponse>(
      'POST',
      '/v1/session/create',
      body: {'client_id': _clientId},
      useApiKey: true,
      fromJson: SessionResponse.fromJson,
    );

    _sessionToken = response.token;

    // Switch the HttpClient to use the session token for all future calls
    _http.setSessionToken(response.token);
    onboarding.setSessionId(response.token);
    liveness.setSessionId(response.token);

    return response;
  }

  /// Convenience: creates a session (if none exists) + verifies identity.
  Future<VerifyIdentityResponse> startOnboarding({
    required OnboardingType onboardingType,
    required String idNumber,
  }) async {
    if (_sessionToken == null) await createSession();
    return onboarding.verify(
      onboardingType: onboardingType,
      idNumber: idNumber,
    );
  }

  /// Fetches the SDK configuration (brand name, theme, channels) from the
  /// backend after a session is created.
  Future<SDKInitializeResponse> initialize() async {
    if (_sessionToken == null) {
      throw StateError('Call createSession() before initialize().');
    }
    return _http.request<SDKInitializeResponse>(
      'GET',
      '/v1/sdk/initialize',
      fromJson: SDKInitializeResponse.fromJson,
    );
  }
}
