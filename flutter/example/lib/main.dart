import 'package:flutter/material.dart';
import 'package:smartcomply_sdk/smartcomply_sdk.dart';

void main() => runApp(const SmartComplyExampleApp());

class SmartComplyExampleApp extends StatelessWidget {
  const SmartComplyExampleApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SmartComply SDK Demo',
      theme: ThemeData.dark(useMaterial3: true),
      home: const DemoPage(),
    );
  }
}

class DemoPage extends StatefulWidget {
  const DemoPage({super.key});
  @override
  State<DemoPage> createState() => _DemoPageState();
}

class _DemoPageState extends State<DemoPage> {
  // ── Configure the SDK ─────────────────────────────────────────────────────
  // apiKey  → Bearer token issued by SmartComply
  // clientId → UUID of your SDK config record (from the SmartComply dashboard)
  final SmartComply _sdk = SmartComply(
    SDKConfig(
      apiKey: 'YOUR_API_KEY_HERE',
      clientId: 'YOUR_CLIENT_UUID_HERE', // e.g. '3fa85f64-5717-4562-b3fc-2c963f66afa6'
      environment: Environment.sandbox,
    ),
  );

  String _log = 'Tap a button to start.';
  bool _busy = false;

  void _append(String msg) => setState(() => _log = '$_log\n$msg');

  // Step 1: Create session
  Future<void> _createSession() async {
    setState(() { _busy = true; _log = 'Creating session…'; });
    try {
      final session = await _sdk.createSession();
      _append('✅ Session token: ${session.token}');
    } on SDKError catch (e) {
      _append('❌ $e');
    } finally {
      setState(() => _busy = false);
    }
  }

  // Step 2: Verify identity (BVN)
  Future<void> _verifyBvn() async {
    setState(() { _busy = true; _log = 'Verifying BVN…'; });
    try {
      final result = await _sdk.onboarding.verify(
        onboardingType: OnboardingType.bvn,
        idNumber: '22476562817',
      );
      _append('Status: ${result.status}');
      _append('Type: ${result.onboardingType}');
      _append('Message: ${result.message}');
    } on SDKError catch (e) {
      _append('❌ $e');
    } finally {
      setState(() => _busy = false);
    }
  }

  // Step 3: Full liveness check
  Future<void> _livenessCheck() async {
    setState(() { _busy = true; _log = 'Starting liveness check…'; });
    try {
      final result = await _sdk.liveness.startCheck(
        context,
        identifier: '22476562817',   // user's ID number
        identifierType: 'bvn',        // 'bvn' or 'nin'
        country: 'nigeria',
        challengeActions: [
          ChallengeAction.blink,
          ChallengeAction.turnLeft,
        ],
      );
      _append('Liveness: ${result.status}');
      _append('Entry status: ${result.livenessStatus}');
    } on SDKError catch (e) {
      _append('❌ $e');
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('SmartComply SDK Demo')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ElevatedButton(onPressed: _busy ? null : _createSession,
                child: const Text('1. Create Session')),
            const SizedBox(height: 8),
            ElevatedButton(onPressed: _busy ? null : _verifyBvn,
                child: const Text('2. Verify BVN')),
            const SizedBox(height: 8),
            ElevatedButton(onPressed: _busy ? null : _livenessCheck,
                child: const Text('3. Start Liveness Check')),
            const SizedBox(height: 16),
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(8)),
                child: SingleChildScrollView(
                  child: Text(_log,
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
