import 'package:flutter/material.dart';
import 'package:notette_flutter/notette_flutter.dart';

void main() => runApp(const ExampleApp());

class ExampleApp extends StatefulWidget {
  const ExampleApp({super.key});
  @override
  State<ExampleApp> createState() => _ExampleAppState();
}

class _ExampleAppState extends State<ExampleApp> {
  final feedback = NotetteController();
  late final client = NotetteClient(
    serverUrl: Uri.parse('https://feedback.example.com'),
    projectKey: 'YOUR_PROJECT_CLIENT_KEY',
    appOrigin: Uri.parse('https://mobile.example.com'),
  );
  @override
  void dispose() {
    client.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        builder: (context, child) => NotetteFeedback(
          client: client,
          controller: feedback,
          deployment: const {'environment': 'preview'},
          screenPath: () => '/home',
          screenTitle: () => 'Home',
          metadata: const {'appVersion': '1.0.0', 'environment': 'preview'},
          screenshots: true,
          child: child!,
        ),
        home: Scaffold(
            appBar: AppBar(title: const Text('Notette example'), actions: [
              IconButton(
                  tooltip: 'Browse feedback',
                  onPressed: feedback.list,
                  icon: const Icon(Icons.forum_outlined))
            ]),
            body: const Center(
                child: Text('Use the feedback button in the bottom right.'))),
      );
}
