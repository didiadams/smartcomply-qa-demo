import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../../client/http_client.dart';
import '../../types/liveness.dart';
import 'liveness_widget.dart';

/// Handles liveness API calls — two-step flow:
/// 1. `POST /v1/liveness/create` — registers the liveness entry, uploads autoshot
/// 2. `POST /v1/liveness/submit` — uploads the recorded video and triggers AI processing
class LivenessModule {
  final HttpClient _http;
  String? _sessionId;

  LivenessModule(this._http);

  void setSessionId(String sessionId) => _sessionId = sessionId;

  String _requireSession() {
    if (_sessionId == null) {
      throw StateError(
        'No active session. Call sdk.createSession() before using liveness methods.',
      );
    }
    return _sessionId!;
  }

  /// Step 1 — Create a liveness entry.
  ///
  /// Uploads [autoshotFile] (a still frame from the camera) along with
  /// the user's identifier and chosen [challengeActions].
  Future<LivenessCreateResponse> create({
    required File autoshotFile,
    required String identifier,
    required String identifierType, // "bvn" or "nin"
    required String country,        // e.g. "nigeria"
    required List<ChallengeAction> challengeActions,
    File? idFile,
    File? snapshotFile,
  }) async {
    final sessionId = _requireSession();

    final files = <http.MultipartFile>[
      await http.MultipartFile.fromPath('autoshot_file', autoshotFile.path),
      if (idFile != null)
        await http.MultipartFile.fromPath('id_file', idFile.path),
      if (snapshotFile != null)
        await http.MultipartFile.fromPath('snapshot_file', snapshotFile.path),
    ];

    return _http.uploadMultipart<LivenessCreateResponse>(
      '/v1/liveness/create',
      fields: {
        'session': sessionId,
        'identifier': identifier,
        'identifier_type': identifierType,
        'country': country,
        'challenge_actions':
            challengeActions.map((a) => a.toJson()).join(','),
      },
      files: files,
      fromJson: LivenessCreateResponse.fromJson,
    );
  }

  /// Step 2 — Submit the recorded video for AI processing.
  ///
  /// [entryId] comes from [LivenessCreateResponse.id].
  Future<LivenessSubmitResponse> submit({
    required int entryId,
    required File videoFile,
  }) async {
    final sessionId = _requireSession();

    return _http.uploadMultipart<LivenessSubmitResponse>(
      '/v1/liveness/submit',
      fields: {
        'session': sessionId,
        'entry': entryId.toString(),
      },
      files: [
        await http.MultipartFile.fromPath('video_file', videoFile.path),
      ],
      fromJson: LivenessSubmitResponse.fromJson,
    );
  }

  /// **All-in-one convenience method.**
  ///
  /// Opens the camera full-screen, guides the user through [challengeActions],
  /// captures an autoshot, records video, creates the liveness entry, and
  /// submits the video — returning [LivenessSubmitResponse].
  ///
  /// ```dart
  /// final result = await sdk.liveness.startCheck(
  ///   context,
  ///   identifier: '22476562817',
  ///   identifierType: 'bvn',
  ///   country: 'nigeria',
  ///   challengeActions: [ChallengeAction.blink, ChallengeAction.turnLeft],
  /// );
  /// ```
  Future<LivenessSubmitResponse> startCheck(
    BuildContext context, {
    required String identifier,
    required String identifierType,
    String country = 'nigeria',
    List<ChallengeAction> challengeActions = const [
      ChallengeAction.blink,
      ChallengeAction.turnLeft,
    ],
  }) async {
    _requireSession();

    final completer = Completer<LivenessCheckResult>();

    if (!context.mounted) throw StateError('BuildContext is no longer mounted.');

    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => LivenessCheckWidget(
          challengeActions: challengeActions,
          onComplete: (autoshotFile, videoFile) {
            if (!completer.isCompleted) {
              completer.complete(
                LivenessCheckResult(
                    autoshotFile: autoshotFile, videoFile: videoFile),
              );
            }
            Navigator.of(context).pop();
          },
        ),
      ),
    );

    final result = await completer.future;

    // Step 1: Create entry
    final entry = await create(
      autoshotFile: result.autoshotFile,
      identifier: identifier,
      identifierType: identifierType,
      country: country,
      challengeActions: challengeActions,
    );

    // Step 2: Submit video
    return submit(entryId: entry.id, videoFile: result.videoFile);
  }
}

/// Internal data class carrying files out of [LivenessCheckWidget].
class LivenessCheckResult {
  final File autoshotFile;
  final File videoFile;
  const LivenessCheckResult(
      {required this.autoshotFile, required this.videoFile});
}
