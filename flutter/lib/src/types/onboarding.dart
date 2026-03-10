/// Supported onboarding ID types.
enum OnboardingType {
  bvn,
  nin,
  driversLicense,
  votersCard,
  passport;

  /// Serialises to the snake_case string the API expects.
  String toJson() {
    switch (this) {
      case OnboardingType.bvn:
        return 'bvn';
      case OnboardingType.nin:
        return 'nin';
      case OnboardingType.driversLicense:
        return 'drivers_license';
      case OnboardingType.votersCard:
        return 'voters_card';
      case OnboardingType.passport:
        return 'passport';
    }
  }
}

/// Response from `POST /v1/session/create`.
class SessionResponse {
  final String token;

  const SessionResponse({required this.token});

  factory SessionResponse.fromJson(Map<String, dynamic> json) =>
      SessionResponse(token: json['token'] as String);
}

/// Request body for identity verification.
class VerifyIdentityRequest {
  final String sessionId;
  final OnboardingType onboardingType;
  final String idNumber;
  final String nameToConfirm;

  const VerifyIdentityRequest({
    required this.sessionId,
    required this.onboardingType,
    required this.idNumber,
    required this.nameToConfirm,
  });

  Map<String, dynamic> toJson() => {
        'session_id': sessionId,
        'onboarding_type': onboardingType.toJson(),
        'id_number': idNumber,
        'name_to_confirm': nameToConfirm,
      };
}

/// Name-matching sub-result inside [VerifyIdentityResponse].
class NameMatch {
  final bool nameMatched;
  final double confidence;

  const NameMatch({required this.nameMatched, required this.confidence});

  factory NameMatch.fromJson(Map<String, dynamic> json) => NameMatch(
        nameMatched: json['name_matched'] as bool,
        confidence: (json['confidence'] as num).toDouble(),
      );
}

/// Response from identity verification.
class VerifyIdentityResponse {
  final String sessionId;
  final String status; // "verified" | "failed"
  final NameMatch match;

  const VerifyIdentityResponse({
    required this.sessionId,
    required this.status,
    required this.match,
  });

  bool get isVerified => status == 'verified';

  factory VerifyIdentityResponse.fromJson(Map<String, dynamic> json) =>
      VerifyIdentityResponse(
        sessionId: json['session_id'] as String,
        status: json['status'] as String,
        match: NameMatch.fromJson(json['match'] as Map<String, dynamic>),
      );
}

/// Onboarding session status.
class OnboardingSession {
  final String sessionId;
  final String status; // created | pending | verified | completed | failed

  const OnboardingSession({required this.sessionId, required this.status});

  factory OnboardingSession.fromJson(Map<String, dynamic> json) =>
      OnboardingSession(
        sessionId: json['session_id'] as String,
        status: json['status'] as String,
      );
}

/// Full onboarding result.
class OnboardingResult {
  final String sessionId;
  final String status;
  final bool verified;

  const OnboardingResult({
    required this.sessionId,
    required this.status,
    required this.verified,
  });

  factory OnboardingResult.fromJson(Map<String, dynamic> json) =>
      OnboardingResult(
        sessionId: json['session_id'] as String,
        status: json['status'] as String,
        verified: json['verified'] as bool,
      );
}
