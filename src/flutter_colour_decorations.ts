import * as fs from "fs";
import * as path from "path";
import * as vs from "vscode";
import { ColourRangeComputer } from "./colour_range_computer";

const svgContents = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
	<rect fill="#{HEX-6}" x="0" y="0" width="16" height="16" fill-opacity="{OPACITY}" />
</svg>
`;

export class FlutterColourDecorations implements vs.Disposable {
  private readonly decorationTypes: { [key: string]: vs.TextEditorDecorationType } = {};
  private readonly subscriptions: vs.Disposable[] = [];
  private readonly computer: ColourRangeComputer;
  private activeEditor?: vs.TextEditor;
  private updateTimeout?: NodeJS.Timeout;

  constructor(private readonly imageStoragePath: string) {
    this.computer = new ColourRangeComputer();
    this.subscriptions.push(vs.workspace.onDidChangeTextDocument((e) => {
      if(this.activeEditor && e.document === this.activeEditor.document) {
        // Delay this so if we're getting lots of updates we don't flicker
        if(this.updateTimeout) {
          clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = setTimeout(() => this.update(), 1000);
      }
    }));

    this.subscriptions.push(vs.window.onDidChangeActiveTextEditor((e) => {
      this.setTrackingFile(e);
      this.update();
    }));

    if(vs.window.activeTextEditor) {
      this.setTrackingFile(vs.window.activeTextEditor);
      this.update();
    }
  }

  private update() {
    if(!this.activeEditor) {
      return;
    }

		const results = this.computer.compute(this.activeEditor.document);

		// Each color needs to be its own decoration, so here we update our main list
		// with any new ones we hadn't previously created.
		for(const colorHex of Object.keys(results)) {
			const filePath = this.createImageFile(colorHex);
			if(filePath && !this.decorationTypes[colorHex]) {
        this.decorationTypes[colorHex] = vs.window.createTextEditorDecorationType({
					gutterIconPath: vs.Uri.file(filePath),
					gutterIconSize: "50%",
				});
      }
		}

		for (const colorHex of Object.keys(this.decorationTypes)) {
			this.activeEditor.setDecorations(
				this.decorationTypes[colorHex],
				results[colorHex] || [],
			);
		}
  }

  private createImageFile(hex: string): string | undefined {
		// Add a version number to the folder in case we need to change these
		// and invalidate the old ones.
		const imageFolder = this.imageStoragePath;
		this.mkDirRecursive(imageFolder);
		const file = path.join(imageFolder, `${hex}.svg`);
    
    if(fs.existsSync(file)) {
      return file;
    }

		try {
			const hex6 = hex.substr(2);
			const opacity = parseInt(hex.substr(0, 2), 16) / 255;
			const imageContents = svgContents
				.replace("{HEX-6}", hex6)
				.replace("{OPACITY}", opacity.toString());
			fs.writeFileSync(file, imageContents);
			return file;
		} catch (e) {
      console.log(e);
			//this.logger.warn(e);
		}
  }
  
  private mkDirRecursive(folder: string) {
    const parent = path.dirname(folder);

    if(!fs.existsSync(parent)) {
      this.mkDirRecursive(parent);
    }

    if(!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }
  }

  private setTrackingFile(editor: vs.TextEditor | undefined) {
    if (editor && this.isAnalyzable(editor.document)) {
			this.activeEditor = editor;
		} else {
      this.activeEditor = undefined;
    }
  }

  dispose() {
    this.activeEditor = undefined;
    this.subscriptions.forEach((s) => s.dispose());
  }

  private isAnalyzable(file: { uri: vs.Uri, isUntitled?: boolean, languageId?: string }): boolean {
    if(file.isUntitled || !this.fsPath(file.uri) || file.uri.scheme !== "file") {
      return false;
    }
  
    const analyzableLanguages = ["dart", "html"];
    const analyzableFilenames = [".analysis_options", "analysis_options.yaml", "pubspec.yaml"];
    // We have to include dart/html extensions as this function may be called without a language ID
    // (for example when triggered by a file system watcher).
    const analyzableFileExtensions = ["dart", "htm", "html"].concat([ "additionalAnalyzerFileExtensions" ]);

    const extName = path.extname(this.fsPath(file.uri));
    const extension = extName ? extName.substr(1) : undefined;
  
    return (file.languageId && analyzableLanguages.indexOf(file.languageId) >= 0)
      || analyzableFilenames.indexOf(path.basename(this.fsPath(file.uri))) >= 0
      || (extension !== undefined && analyzableFileExtensions.includes(extension));
  }

  private fsPath(uri: { fsPath: string } | string) {
    return this.forceWindowsDriveLetterToUppercase(typeof uri === "string" ? uri : uri.fsPath);
  }

  private forceWindowsDriveLetterToUppercase(p: string): string {
    const isWin = /^win/.test(process.platform);

    if(p && isWin && path.isAbsolute(p) && p.charAt(0) === p.charAt(0).toLowerCase()) {
      p = p.substr(0, 1).toUpperCase() + p.substr(1);
    }
    return p;
  }
}