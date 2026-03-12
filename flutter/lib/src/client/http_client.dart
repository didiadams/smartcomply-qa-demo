import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../errors/sdk_error.dart';
import 'config.dart';

/// HTTP client for the SmartComply SDK.
///
/// Auth strategy:
/// - [createSession] is called with `Authorization: Bearer <apiKey>`
/// - All subsequent calls use `Authorization: Bearer <sessionToken>`
///   Once a session token is set via [setSessionToken], it takes precedence.
class HttpClient {
  final String _baseUrl;
  final String _apiKey;
  final Duration _timeout;
  String? _sessionToken;

  HttpClient(SDKConfig config)
      : _baseUrl = kBaseUrls[config.environment]!,
        _apiKey = config.apiKey,
        _timeout = config.timeout;

  /// Called by SmartComply after a successful session creation.
  void setSessionToken(String token) => _sessionToken = token;

  /// Clears the session token (e.g. after session revocation).
  void clearSessionToken() => _sessionToken = null;

  String get _bearerToken => _sessionToken ?? _apiKey;



  /// Sends a JSON request. Use [useApiKey] = true to force api_key auth
  /// (used only for session creation before a token exists).
  Future<T> request<T>(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool useApiKey = false,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final uri = Uri.parse('$_baseUrl$path');
    final authHeader = useApiKey ? _apiKey : _bearerToken;
    final headers = {
      'Authorization': 'Bearer $authHeader',
      'Content-Type': 'application/json',
    };

    late http.Response response;
    try {
      switch (method.toUpperCase()) {
        case 'GET':
          response = await http.get(uri, headers: headers).timeout(_timeout);
          break;
        case 'POST':
          response = await http
              .post(uri, headers: headers,
                  body: body != null ? jsonEncode(body) : null)
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

    return _parseResponse(response, path, fromJson);
  }

  /// Multipart upload — used for liveness/create and liveness/submit.
  Future<T> uploadMultipart<T>(
    String path, {
    required Map<String, String> fields,
    required List<http.MultipartFile> files,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final uri = Uri.parse('$_baseUrl$path');

    final multipart = http.MultipartRequest('POST', uri)
      ..headers['Authorization'] = 'Bearer $_bearerToken'
      ..fields.addAll(fields)
      ..files.addAll(files);

    late http.StreamedResponse streamed;
    try {
      streamed = await multipart.send().timeout(_timeout);
    } on SocketException {
      throw SDKError('Network unavailable', 0);
    }

    final response = await http.Response.fromStream(streamed);
    return _parseResponse(response, path, fromJson);
  }

  T _parseResponse<T>(
    http.Response response,
    String path,
    T Function(Map<String, dynamic>) fromJson,
  ) {
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
}
