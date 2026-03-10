import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:path_provider/path_provider.dart';

import '../../camera/action_detector.dart';
import '../../types/liveness.dart';

/// Callback invoked when the liveness capture finishes.
typedef LivenessCompleteCallback = void Function(
  File videoFile,
  String challengeId,
);

/// Full-screen Flutter widget that:
/// 1. Opens the front camera
/// 2. Streams frames through ML Kit face detection
/// 3. Guides the user through sequential actions
/// 4. Records the session video
/// 5. Calls [onComplete] with the recorded [File] and [challengeId]
///
/// This is the Flutter equivalent of `LivenessUI.ts` + the camera loop in
/// `LivenessModule.startCheck()`.
class LivenessCheckWidget extends StatefulWidget {
  final LivenessChallengeResponse challenge;
  final LivenessCompleteCallback onComplete;
  final VoidCallback? onTimeout;

  const LivenessCheckWidget({
    super.key,
    required this.challenge,
    required this.onComplete,
    this.onTimeout,
  });

  @override
  State<LivenessCheckWidget> createState() => _LivenessCheckWidgetState();
}

class _LivenessCheckWidgetState extends State<LivenessCheckWidget> {
  // Camera
  CameraController? _cameraController;
  bool _cameraReady = false;

  // ML Kit face detection
  final FaceDetector _faceDetector = FaceDetector(
    options: FaceDetectorOptions(
      enableClassification: true, // smilingProbability, eyeOpenProbability
      enableTracking: false,
      performanceMode: FaceDetectorMode.fast,
    ),
  );
  bool _isDetecting = false;

  // Actions
  late ActionDetector _actionDetector;
  List<ActionState> _actionStates = [];
  String _instruction = '';

  // Timer
  late int _remaining;
  Timer? _countdownTimer;

  // State flags
  bool _completed = false;
  bool _timedOut = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _actionDetector = ActionDetector(widget.challenge.actions);
    _actionStates = widget.challenge.actions
        .map((a) => ActionState(action: a))
        .toList();
    _instruction = widget.challenge.instruction;
    _remaining = widget.challenge.timeLimitSeconds;
    _initCamera();
  }

  Future<void> _initCamera() async {
    final cameras = await availableCameras();
    final front = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );

    _cameraController = CameraController(
      front,
      ResolutionPreset.medium,
      enableAudio: false,
      imageFormatGroup: Platform.isAndroid
          ? ImageFormatGroup.nv21
          : ImageFormatGroup.bgra8888,
    );

    try {
      await _cameraController!.initialize();
      if (!mounted) return;
      setState(() => _cameraReady = true);
      _startCountdown();
      _startVideoRecording();
      _cameraController!.startImageStream(_onFrame);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  void _startCountdown() {
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _remaining--);
      if (_remaining <= 0 && !_completed) {
        _countdownTimer?.cancel();
        _handleTimeout();
      }
    });
  }

  Future<void> _startVideoRecording() async {
    try {
      await _cameraController?.startVideoRecording();
    } catch (_) {
      // Video recording is best-effort
    }
  }

  Future<void> _onFrame(CameraImage image) async {
    if (_isDetecting || _completed || _timedOut) return;
    _isDetecting = true;

    try {
      final inputImage = _cameraImageToInputImage(image);
      if (inputImage == null) return;

      final faces = await _faceDetector.processImage(inputImage);
      final face = faces.isNotEmpty ? faces.first : null;

      final states = _actionDetector.check(face);

      if (!mounted) return;

      setState(() {
        _actionStates = states;
        final current = _actionDetector.getCurrentAction();

        if (face == null) {
          _instruction = 'Position your face in the oval';
        } else if (current != null) {
          _instruction = _describeAction(current);
        } else {
          _instruction = 'All actions completed!';
        }
      });

      if (_actionDetector.allCompleted() && !_completed) {
        _completed = true;
        await _finishCapture();
      }
    } finally {
      _isDetecting = false;
    }
  }

  InputImage? _cameraImageToInputImage(CameraImage image) {
    final camera = _cameraController?.description;
    if (camera == null) return null;

    final rotation = InputImageRotationValue.fromRawValue(
          camera.sensorOrientation,
        ) ??
        InputImageRotation.rotation0deg;

    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (format == null) return null;

    final plane = image.planes.first;
    return InputImage.fromBytes(
      bytes: plane.bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: plane.bytesPerRow,
      ),
    );
  }

  Future<void> _handleTimeout() async {
    if (_timedOut) return;
    _timedOut = true;
    await _finishCapture();
    widget.onTimeout?.call();
  }

  Future<void> _finishCapture() async {
    _countdownTimer?.cancel();
    await _cameraController?.stopImageStream();

    try {
      final xfile = await _cameraController?.stopVideoRecording();
      if (xfile != null) {
        final videoFile = File(xfile.path);
        widget.onComplete(videoFile, widget.challenge.challengeId);
      } else {
        // Fallback: create empty temp file so the caller can still call verify
        final tmp = await getTemporaryDirectory();
        final fallback = File('${tmp.path}/liveness_fallback.mp4');
        await fallback.create();
        widget.onComplete(fallback, widget.challenge.challengeId);
      }
    } catch (_) {
      final tmp = await getTemporaryDirectory();
      final fallback = File('${tmp.path}/liveness_fallback.mp4');
      await fallback.create();
      widget.onComplete(fallback, widget.challenge.challengeId);
    }
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _faceDetector.close();
    _cameraController?.dispose();
    super.dispose();
  }

  // ── UI ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return _buildError(_error!);
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      body: SafeArea(
        child: Stack(
          children: [
            // Camera preview
            if (_cameraReady && _cameraController != null)
              Positioned.fill(
                child: Transform(
                  alignment: Alignment.center,
                  transform: Matrix4.identity()..scale(-1.0, 1.0), // mirror
                  child: CameraPreview(_cameraController!),
                ),
              ),

            // Face oval guide
            Positioned.fill(child: _buildOvalGuide()),

            // Top instruction bar
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: _buildTopBar(),
            ),

            // Bottom action panel
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: _buildBottomPanel(),
            ),

            // Loading overlay
            if (!_cameraReady)
              Positioned.fill(
                child: Container(
                  color: const Color(0xFF0A0A0A),
                  child: const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildOvalGuide() {
    return CustomPaint(
      painter: _OvalGuidePainter(
        activeConfidence: _actionStates
            .where((s) => s.active && !s.detected)
            .fold(0.0, (_, s) => s.confidence),
      ),
    );
  }

  Widget _buildTopBar() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xB3000000), Colors.transparent],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      child: Text(
        _instruction,
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 15,
          fontWeight: FontWeight.w600,
          height: 1.4,
        ),
      ),
    );
  }

  Widget _buildBottomPanel() {
    final total = _actionStates.length;
    final done = _actionStates.where((s) => s.detected).length;
    final progress = total > 0 ? done / total : 0.0;

    final min = _remaining ~/ 60;
    final sec = _remaining % 60;
    final timerText = min > 0
        ? '$min:${sec.toString().padLeft(2, '0')}'
        : '${_remaining}s';

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Color(0xD9000000), Color(0x99000000), Colors.transparent],
          stops: [0, 0.6, 1],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Progress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: Colors.white24,
              valueColor: const AlwaysStoppedAnimation(Color(0xFF22C55E)),
              minHeight: 3,
            ),
          ),
          const SizedBox(height: 14),

          // Steps
          ..._actionStates.map(_buildStep),

          const SizedBox(height: 12),

          // Timer
          Text(
            '$timerText remaining',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _remaining <= 5 ? const Color(0xFFEF4444) : Colors.white54,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStep(ActionState state) {
    Color bg = Colors.white.withOpacity(0.06);
    Color borderColor = Colors.white24;
    Color numBg = Colors.white.withOpacity(0.12);
    double opacity = 0.4;
    Widget numChild = Text(
      '${_actionStates.indexOf(state) + 1}',
      style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700),
    );

    if (state.detected) {
      bg = const Color(0xFF22C55E).withOpacity(0.15);
      borderColor = const Color(0xFF22C55E);
      numBg = const Color(0xFF22C55E);
      opacity = 1.0;
      numChild = const Icon(Icons.check, color: Colors.white, size: 16);
    } else if (state.active) {
      bg = const Color(0xFF3B82F6).withOpacity(0.15);
      borderColor = const Color(0xFF3B82F6);
      numBg = const Color(0xFF3B82F6).withOpacity(0.3);
      opacity = 1.0;
    }

    return Opacity(
      opacity: opacity,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: numBg,
                shape: BoxShape.circle,
                border: Border.all(color: borderColor, width: 2),
              ),
              child: Center(child: numChild),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                _describeAction(state.action),
                style: const TextStyle(color: Colors.white, fontSize: 13),
              ),
            ),
            Text(
              _actionIcon(state.action),
              style: const TextStyle(fontSize: 18),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildError(String msg) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Camera error: $msg',
            style: const TextStyle(color: Colors.white70),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }

  String _describeAction(String action) {
    const labels = {
      'smile': 'Smile naturally',
      'blink': 'Blink your eyes',
      'turn_left': 'Turn your head left',
      'turn_right': 'Turn your head right',
      'nod': 'Nod your head',
      'open_mouth': 'Open your mouth wide',
      'raise_eyebrows': 'Raise your eyebrows',
      'close_eyes': 'Close both eyes',
      'look_up': 'Look upward',
      'look_down': 'Look downward',
      'puff_cheeks': 'Puff your cheeks',
      'pucker_lips': 'Pucker your lips',
    };
    return labels[action] ?? action.replaceAll('_', ' ');
  }

  String _actionIcon(String action) {
    const icons = {
      'smile': '😄',
      'blink': '😉',
      'turn_left': '⬅',
      'turn_right': '➡',
      'nod': '🙂',
      'open_mouth': '😮',
      'raise_eyebrows': '😲',
      'close_eyes': '😌',
      'look_up': '👀',
      'look_down': '👇',
      'puff_cheeks': '😤',
      'pucker_lips': '😗',
    };
    return icons[action] ?? '';
  }
}

// ── Oval guide painter ──────────────────────────────────────────────────────

class _OvalGuidePainter extends CustomPainter {
  final double activeConfidence;

  const _OvalGuidePainter({this.activeConfidence = 0});

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height * 0.38;
    final rx = size.width * 0.38;
    final ry = size.height * 0.32;
    final rect = Rect.fromCenter(
      center: Offset(cx, cy),
      width: rx * 2,
      height: ry * 2,
    );

    // Background guide ring (dashed)
    final guidePaint = Paint()
      ..color = Colors.white.withOpacity(0.25)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5;
    canvas.drawOval(rect, guidePaint);

    // Confidence ring
    if (activeConfidence > 0) {
      final confPaint = Paint()
        ..color = activeConfidence > 0.6
            ? const Color(0xFF22C55E)
            : const Color(0xFF3B82F6)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.5
        ..strokeCap = StrokeCap.round;

      final sweep = 2 * 3.14159 * activeConfidence;
      canvas.drawArc(rect, -3.14159 / 2, sweep, false, confPaint);
    }
  }

  @override
  bool shouldRepaint(_OvalGuidePainter old) =>
      old.activeConfidence != activeConfidence;
}
