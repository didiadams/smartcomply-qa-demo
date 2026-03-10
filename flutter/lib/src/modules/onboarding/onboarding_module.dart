import '../../client/http_client.dart';
import '../../types/onboarding.dart';

/// Handles identity verification (onboarding) API calls.
/// Mirrors the TypeScript `OnboardingModule` class.
class OnboardingModule {
  final HttpClient _http;
  String? _sessionId;

  OnboardingModule(this._http);

  void setSessionId(String sessionId) => _sessionId = sessionId;

  String _requireSession() {
    if (_sessionId == null) {
      throw StateError(
        'No active session. Call sdk.createSession() before using onboarding methods.',
      );
    }
    return _sessionId!;
  }

  /// Verifies the user's identity against the given ID.
  Future<VerifyIdentityResponse> verify({
    required OnboardingType onboardingType,
    required String idNumber,
    required String nameToConfirm,
  }) {
    final sessionId = _requireSession();
    return _http.request<VerifyIdentityResponse>(
      'POST',
      '/v1/onboarding/verify',
      body: {
        'session_id': sessionId,
        'onboarding_type': onboardingType.toJson(),
        'id_number': idNumber,
        'name_to_confirm': nameToConfirm,
      },
      fromJson: VerifyIdentityResponse.fromJson,
    );
  }

  /// Retrieves the current onboarding session status.
  Future<OnboardingSession> status() {
    final sessionId = _requireSession();
    return _http.request<OnboardingSession>(
      'GET',
      '/v1/onboarding/status/$sessionId',
      fromJson: OnboardingSession.fromJson,
    );
  }

  /// Retrieves the final onboarding result.
  Future<OnboardingResult> result() {
    final sessionId = _requireSession();
    return _http.request<OnboardingResult>(
      'GET',
      '/v1/onboarding/result/$sessionId',
      fromJson: OnboardingResult.fromJson,
    );
  }
}
