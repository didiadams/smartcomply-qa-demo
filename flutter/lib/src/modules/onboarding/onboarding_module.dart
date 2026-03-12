import '../../client/http_client.dart';
import '../../types/onboarding.dart';

/// Handles identity verification (onboarding) API calls.
/// Endpoint: POST /v1/onboarding/verify
///
/// Auth: Authorization: Bearer <session_token>
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

  /// Verifies the user's identity.
  ///
  /// For [OnboardingType.bvn], pass the BVN as [idNumber] — sent as `"bvn"` field.
  /// For [OnboardingType.nin], pass the NIN as [idNumber] — sent as `"id_number"` field.
  Future<VerifyIdentityResponse> verify({
    required OnboardingType onboardingType,
    required String idNumber,
  }) async {
    final sessionId = _requireSession();

    // The real backend uses different field names per type:
    // BVN → {"bvn": "<number>"}   NIN → {"id_number": "<number>"}
    final idField = onboardingType == OnboardingType.bvn ? 'bvn' : 'id_number';

    return _http.request<VerifyIdentityResponse>(
      'POST',
      '/v1/onboarding/verify',
      body: {
        'session_id': sessionId,
        'onboarding_type': onboardingType.toJson(),
        idField: idNumber,
      },
      fromJson: VerifyIdentityResponse.fromJson,
    );
  }
}
