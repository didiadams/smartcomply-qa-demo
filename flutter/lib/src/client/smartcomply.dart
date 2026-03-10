import '../client/http_client.dart';
import '../client/config.dart';
import '../modules/onboarding/onboarding_module.dart';
import '../modules/liveness/liveness_module.dart';
import '../types/onboarding.dart';

/// The primary entry point for the SmartComply Flutter SDK.
/// Mirrors the TypeScript `SmartComply` class.
///
/// Usage:
/// ```dart
/// final sdk = SmartComply(SDKConfig(apiKey: 'pk_live_xxx'));
/// await sdk.createSession();
/// final result = await sdk.onboarding.verify(...);
/// final liveness = await sdk.liveness.startCheck(context);
/// ```
class SmartComply {
  final HttpClient _http;
  final String _apiKey;
  String? _sessionId;

  late final OnboardingModule onboarding;
  late final LivenessModule liveness;

  SmartComply(SDKConfig config)
      : _http = HttpClient(config),
        _apiKey = config.apiKey {
    if (config.apiKey.isEmpty) {
      throw ArgumentError('SmartComply: apiKey is required');
    }
    onboarding = OnboardingModule(_http);
    liveness = LivenessModule(_http);
  }

  /// The active session token, or null if [createSession] has not been called.
  String? get sessionId => _sessionId;

  /// Creates a new verification session and propagates the token to all
  /// sub-modules. Must be called before using [onboarding] or [liveness].
  Future<SessionResponse> createSession() async {
    final response = await _http.request<SessionResponse>(
      'POST',
      '/v1/session/create',
      body: {'api_key': _apiKey},
      fromJson: SessionResponse.fromJson,
    );

    _sessionId = response.token;
    onboarding.setSessionId(response.token);
    liveness.setSessionId(response.token);

    return response;
  }

  /// Convenience: creates a session (if none exists) then runs identity
  /// verification. Mirrors `startOnboarding()` in the TypeScript SDK.
  Future<VerifyIdentityResponse> startOnboarding({
    required OnboardingType onboardingType,
    required String idNumber,
    required String nameToConfirm,
  }) async {
    if (_sessionId == null) {
      await createSession();
    }
    return onboarding.verify(
      onboardingType: onboardingType,
      idNumber: idNumber,
      nameToConfirm: nameToConfirm,
    );
  }
}
