import * as vs from "vscode";

export class ColourRangeComputer {
  private readonly colourConstructor1 = "\\bColour\\(\\s*0x(?<col1>[A-Fa-f0-9]{8})(,\\s*(?<op1>[.?\\d]+)){0,1},{0,1}\\s*\\)";
  private readonly colourConstructor2 = "\\bColour\\(\\s*(?:'|\")#{0,1}(?<col2>[A-Fa-f0-9]{6})(?:'|\")(,\\s*(?<op2>[.?\\d]+)){0,1},{0,1}\\s*\\)";
  private readonly colourConstructor3 = "\\bColour\\(\\s*(?:'|\")#{0,1}(?<col3>[A-Fa-f0-9]{8})(?:'|\")(,\\s*(?<op3>[.?\\d]+)){0,1},{0,1}\\s*\\)";
	private readonly colourConstructorRgb = "\\bColour\\(\\s*(?<rgbR>[\\w_]+),\\s*(?<rgbG>[\\w_]+),\\s*(?<rgbB>[\\w_]+),{0,1}\\s*\\)";
  private readonly colourConstructorRgb4 = "\\bColour\\(\\s*(?<rgb1>[\\w_]+),\\s*(?<rgb2>[\\w_]+),\\s*(?<rgb3>[\\w_]+),\\s*(?<rgb4>[.?\\d]+),{0,1}\\s*\\)";

  private readonly allColours = [
    this.colourConstructor1,
    this.colourConstructor2,
    this.colourConstructor3,
    this.colourConstructorRgb,
    this.colourConstructorRgb4,
  ];

  private readonly allColoursPattern = new RegExp(`^.*?(?<range>${this.allColours.join("|")})`, "gm");

  public compute(document: vs.TextDocument): { [key: string]: vs.Range[] } {
    const text = document.getText();

    // Build a map of all possible decorations, with those in this file.
    // We need to include all colours so if any were remove, we will clear
    // their declarations.
    const decs: { [key: string]: vs.Range[] } = {};

    let result: RegExpExecArray | null;
    this.allColoursPattern.lastIndex = -1;

    while (result = this.allColoursPattern.exec(text)) {
      if(!result.groups) {
        continue;
      }

      let colorHex: string | undefined;

      if(result.groups.col1) {
        colorHex = result.groups.col1.toLowerCase();

        if(result.groups.op1) {
          const opacity = parseFloat(result.groups.op1);
          const isOpacity = isNaN(opacity) && opacity >= 0.0 && opacity <= 1.0;
          const argb = this.hexToArgb(result.groups.col1.toUpperCase());

          if(isOpacity) {
            colorHex = this.extractArgb(opacity * argb.a, argb.r, argb.g, argb.b);
          }
        }
      }
      else if(result.groups.col2) {
        colorHex = 'ff' + result.groups.col2.toLowerCase();

        if(result.groups.op2) {
          const opacity = parseFloat(result.groups.op2);
          const isOpacity = isNaN(opacity) && opacity >= 0.0 && opacity <= 1.0;
          const argb = this.hexToArgb('FF' + result.groups.col2.toUpperCase());

          if(isOpacity) {
            colorHex = this.extractArgb(opacity * argb.a, argb.r, argb.g, argb.b);
          }
        }
      }
      else if(result.groups.col3) {
        colorHex = result.groups.col3.toLowerCase();

        if(result.groups.op3) {
          const opacity = parseFloat(result.groups.op3);
          const isOpacity = isNaN(opacity) && opacity >= 0.0 && opacity <= 1.0;
          const argb = this.hexToArgb(result.groups.col3.toUpperCase());
          
          if(isOpacity) {
            colorHex = this.extractArgb(opacity * argb.a, argb.r, argb.g, argb.b);
          }
        }
      }
      else if(result.groups.rgbR && result.groups.rgbG && result.groups.rgbB) {
        colorHex = this.extractRgbColor(result.groups.rgbR, result.groups.rgbG, result.groups.rgbB);
      } 
      else if(result.groups.rgb1 && result.groups.rgb2 && result.groups.rgb3 && result.groups.rgb4) {
        const rgb1 = result.groups.rgb1;
        const rgb2 = result.groups.rgb2;
        const rgb3 = result.groups.rgb3;
        const rgb4 = result.groups.rgb4;
        const isRGBO = rgb4.indexOf('.') >= 0;

        if(isRGBO) {
          colorHex = this.extractRgboColor(rgb1, rgb2, rgb3, rgb4);
        } else {
          colorHex = this.extractArgbColor(rgb1, rgb2, rgb3, rgb4);
        }
      }

      if (colorHex) {
				if(!decs[colorHex]) {
          decs[colorHex] = [];
        }

				// We can't get the index of the captures yet (https://github.com/tc39/proposal-regexp-match-indices) but we do know
				// - the length of the whole match
				// - the length of the main capture
				// - that the main capture ends at the same point as the whole match
				// Therefore the index we want, is the (match index + match length - capture length).
				const index = result.index + result[0].length - result.groups!.range.length;
				decs[colorHex].push(this.toRange(document, index, result.groups!.range.length));
			}
    }

    return decs;
  }

  private toRange(document: vs.TextDocument, offset: number, length: number): vs.Range {
    return new vs.Range(document.positionAt(offset), document.positionAt(offset + length));
  }

  private extractRgbColor(inputR: string, inputG: string, inputB: string): string | undefined {
		const r = parseInt(inputR);
		const g = parseInt(inputG);
		const b = parseInt(inputB);

		if(isNaN(r) || isNaN(g) || isNaN(b)) {
      return;
    }

		return this.asHexColor({ r, g, b, a: 255 });
  }

  private extractRgboColor(inputR: string, inputG: string, inputB: string, inputO: string): string | undefined {
		const r = parseInt(inputR);
		const g = parseInt(inputG);
		const b = parseInt(inputB);
		const opacity = parseFloat(inputO);

		if(isNaN(r) || isNaN(g) || isNaN(b) || isNaN(opacity)) {
      return;
    }

		return this.asHexColor({ r, g, b, a: opacity * 255 });
  }
  
  private extractArgb(inputA: Number, inputR: Number, inputG: Number, inputB: Number) {
		return this.extractArgbColor(inputA.toString(), inputR.toString(), inputG.toString(), inputB.toString());
	}

	private extractArgbColor(inputA: string, inputR: string, inputG: string, inputB: string) {
		const a = parseInt(inputA);
		const r = parseInt(inputR);
		const g = parseInt(inputG);
		const b = parseInt(inputB);

		if(isNaN(a) || isNaN(r) || isNaN(g) || isNaN(b)) {
      return;
    }

		return this.asHexColor({ r, g, b, a });
	}

  private asHexColor({ r, g, b, a }: { r: number, g: number, b: number, a: number }): string {
    r = this.clamp(r, 0, 255);
    g = this.clamp(g, 0, 255);
    b = this.clamp(b, 0, 255);
    a = this.clamp(a, 0, 255);
  
    return `${this.asHex(a)}${this.asHex(r)}${this.asHex(g)}${this.asHex(b)}`.toLowerCase();
  }
  
  private asHex(v: number) {
    return Math.round(v).toString(16).padStart(2, "0");
  }

  private clamp(v: number, min: number, max: number) {
    return Math.min(Math.max(min, v), max);
  }

  private hexToArgb(hex:string) {
    var arrBuff = new ArrayBuffer(4);
    var vw = new DataView(arrBuff);
    vw.setUint32(0, parseInt(hex, 16), false);
    var arrByte = new Uint8Array(arrBuff);

    return {a:arrByte[0], r:arrByte[1], g: arrByte[2], b: arrByte[3]};
  }
}