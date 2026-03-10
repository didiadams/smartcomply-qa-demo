import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../errors/sdk_error.dart';
import 'config.dart';

/// HTTP client that wraps the `http` package.
/// Mirrors the TypeScript `HttpClient` class.
class HttpClient {
  final String _baseUrl;
  final String _apiKey;
  final Duration _timeout;

  HttpClient(SDKConfig config)
      : _baseUrl = kBaseUrls[config.environment]!,
        _apiKey = config.apiKey,
        _timeout = config.timeout;

  Map<String, String> get _headers => {
        'Authorization': 'Bearer $_apiKey',
        'Content-Type': 'application/json',
      };

  /// Sends a JSON request and returns the decoded response body as [T].
  Future<T> request<T>(
    String method,
    String path, {
    Map<String, dynamic>? body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final uri = Uri.parse('$_baseUrl$path');

    late http.Response response;

    try {
      switch (method.toUpperCase()) {
        case 'GET':
          response = await http
              .get(uri, headers: _headers)
              .timeout(_timeout);
          break;
        case 'POST':
          response = await http
              .post(
                uri,
                headers: _headers,
                body: body != null ? jsonEncode(body) : null,
              )
              .timeout(_timeout);
          break;
        default:
          throw SDKError('Unsupported HTTP method: $method');
      }
    } on SocketException {
      throw SDKError('Network unavailable', 0);
    } on http.ClientException catch (e) {
      throw SDKError('Network error: ${e.message}', 0);
    }

    final contentType = response.headers['content-type'] ?? '';
    if (!contentType.contains('application/json')) {
      throw SDKError(
        'Unexpected response from $path (${response.statusCode})',
        response.statusCode,
      );
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final msg = data['detail'] ??
          data['message'] ??
          data['error'] ??
          jsonEncode(data);
      throw SDKError('$path failed: $msg', response.statusCode);
    }

    return fromJson(data);
  }

  /// Uploads a file via multipart POST and returns the decoded response as [T].
  Future<T> upload<T>(
    String path, {
    required String challengeId,
    required File videoFile,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final uri = Uri.parse('$_baseUrl$path');

    final multipart = http.MultipartRequest('POST', uri)
      ..headers['Authorization'] = 'Bearer $_apiKey'
      ..fields['challenge_id'] = challengeId
      ..files.add(await http.MultipartFile.fromPath('video', videoFile.path));

    late http.StreamedResponse streamed;
    try {
      streamed = await multipart.send().timeout(_timeout);
    } on SocketException {
      throw SDKError('Network unavailable', 0);
    }

    final response = await http.Response.fromStream(streamed);

    final contentType = response.headers['content-type'] ?? '';
    if (!contentType.contains('application/json')) {
      throw SDKError(
        'Unexpected upload response (${response.statusCode})',
        response.statusCode,
      );
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final msg = data['detail'] ??
          data['message'] ??
          data['error'] ??
          jsonEncode(data);
      throw SDKError('Upload failed: $msg', response.statusCode);
    }

    return fromJson(data);
  }
}
