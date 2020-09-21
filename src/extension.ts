// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { FlutterColourDecorations } from './flutter_colour_decorations';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(new FlutterColourDecorations(context.globalStoragePath));
}

// this method is called when your extension is deactivated
export function deactivate() {}
