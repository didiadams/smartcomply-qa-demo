/// Response from `POST /v1/liveness/start`.
class LivenessChallengeResponse {
  final String challengeId;
  final List<String> actions;
  final String instruction;
  final int timeLimitSeconds;
  final String expiresAt;

  const LivenessChallengeResponse({
    required this.challengeId,
    required this.actions,
    required this.instruction,
    required this.timeLimitSeconds,
    required this.expiresAt,
  });

  factory LivenessChallengeResponse.fromJson(Map<String, dynamic> json) =>
      LivenessChallengeResponse(
        challengeId: json['challenge_id'] as String,
        actions: List<String>.from(json['actions'] as List),
        instruction: json['instruction'] as String,
        timeLimitSeconds: json['time_limit_seconds'] as int,
        expiresAt: json['expires_at'] as String,
      );
}

/// Response from `POST /v1/liveness/verify`.
class LivenessVerifyResponse {
  final String status; // "verified" | "failed"
  final double? verificationScore;
  final List<String>? detectedActions;
  final bool? actionsMatched;
  final String? verifiedAt;
  final String? reason;
  final List<String>? expectedActions;
  final bool? canRetry;

  const LivenessVerifyResponse({
    required this.status,
    this.verificationScore,
    this.detectedActions,
    this.actionsMatched,
    this.verifiedAt,
    this.reason,
    this.expectedActions,
    this.canRetry,
  });

  bool get isVerified => status == 'verified';

  factory LivenessVerifyResponse.fromJson(Map<String, dynamic> json) =>
      LivenessVerifyResponse(
        status: json['status'] as String,
        verificationScore: json['verification_score'] != null
            ? (json['verification_score'] as num).toDouble()
            : null,
        detectedActions: json['detected_actions'] != null
            ? List<String>.from(json['detected_actions'] as List)
            : null,
        actionsMatched: json['actions_matched'] as bool?,
        verifiedAt: json['verified_at'] as String?,
        reason: json['reason'] as String?,
        expectedActions: json['expected_actions'] != null
            ? List<String>.from(json['expected_actions'] as List)
            : null,
        canRetry: json['can_retry'] as bool?,
      );
}
