/// Supported onboarding ID types — Nigeria KYC.
enum OnboardingType {
  bvn,
  nin;

  String toJson() => name; // 'bvn' or 'nin'
}

/// Response from `POST /v1/session/create`.
class SessionResponse {
  final String token;
  const SessionResponse({required this.token});
  factory SessionResponse.fromJson(Map<String, dynamic> json) =>
      SessionResponse(token: json['token'] as String);
}

/// Response from `POST /v1/onboarding/verify`.
class VerifyIdentityResponse {
  final String status;         // "verified" | "failed"
  final String onboardingType; // "bvn" | "nin"
  final String? verifiedAt;
  final String? message;

  const VerifyIdentityResponse({
    required this.status,
    required this.onboardingType,
    this.verifiedAt,
    this.message,
  });

  bool get isVerified => status == 'verified';

  factory VerifyIdentityResponse.fromJson(Map<String, dynamic> json) =>
      VerifyIdentityResponse(
        status: json['status'] as String,
        onboardingType: json['onboarding_type'] as String? ?? '',
        verifiedAt: json['verified_at'] as String?,
        message: json['message'] as String?,
      );
}
