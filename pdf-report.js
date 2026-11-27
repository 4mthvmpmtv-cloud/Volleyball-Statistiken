(() => {
  const dialog = $('pdf-dialog');
  const status = $('pdf-status');
  const shareButton = $('pdf-share');
  const downloadButton = $('pdf-download');
  let file;
  let generation = 0;

  function copySelection(root) {
    const copy = root.cloneNode(true);
    const values = Array.from(root.querySelectorAll('select'), field => field.value);
    copy.querySelectorAll('select').forEach((field, i) => { field.value = values[i]; });
    return copy;
  }

  function snapshot(complete) {
    const courtGame = $('courtGame112');
    const courtSet = $('courtSet119');
    const courtFilter = $('courtFilter112');
    const courtMode = $('courtMode112');
    const previous = [courtGame, courtSet, courtFilter, courtMode].map(field => field.value);
    const chartNodes = [];
    fullReport = complete;
    try {
      if (complete) {
        courtGame.value = 'current';
        courtSet.value = courtFilter.value = 'all';
        courtMode.value = 'heat';
      }
      charts();
      chartNodes.push(copySelection($('charts')));
      const context = [];
      if (!complete && !$('scopeLabel119').hidden) {
        context.push($('scope119').selectedOptions[0]?.textContent);
      }
      if (!$('courtReport112').hidden) {
        const original = $('courtAnalysis112');
        const court = copySelection($('courtReport112'));
        const canvas = court.querySelector('canvas');
        canvas.width = original.width;
        canvas.height = original.height;
        canvas.getContext('2d').drawImage(original, 0, 0);
        chartNodes.push(court);
      }
      const scoped = complete || ['overview','details','compare'].includes(tab);
      const game = ['timeline','rotation'].includes(tab) && !complete ? game100() : null;
      const report = scoped ? $('matchReport').textContent : game?.name || '';
      const title = complete ? 'Vollständiger Spielbericht' : $('reporttabs').querySelector('.active')?.textContent || 'Analysebericht';
      return {title, report, name: game?.name || (scoped ? match.name : title), context: context.filter(Boolean), chartNodes};
    } finally {
      fullReport = false;
      if (complete) {
        [courtGame, courtSet, courtFilter, courtMode].forEach((field, i) => { field.value = previous[i]; });
        charts();
      }
    }
  }

  async function createPdf(report) {
    const {PDFDocument, StandardFonts, rgb} = PDFLib;
    const pdf = await PDFDocument.create();
    pdf.setTitle(report.title);
    pdf.setCreator('Volleyball-Statistiken');
    const normal = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(.09,.19,.15);
    const green = rgb(.09,.32,.23);
    const pale = rgb(.93,.96,.94);
    const width = 595;
    const height = 842;
    const margin = 42;
    const usable = width - margin * 2;
    const measure = document.createElement('canvas').getContext('2d');
    let page, y;

    function newPage() {
      page = pdf.addPage([width, height]);
      page.drawText('VOLLEYBALL-STATISTIKEN', {x:margin, y:height-39, font:bold, size:10, color:green});
      page.drawLine({start:{x:margin,y:height-49},end:{x:width-margin,y:height-49},color:pale,thickness:1});
      page.drawText(String(pdf.getPageCount()), {x:width-margin-12, y:26, font:normal, size:9, color:green});
      y = height-67;
    }

    function reserve(space) {
      if (y - space < margin) newPage();
    }

    function canvasFont(font, size) {
      return (font === bold ? 'bold ' : '') + size + 'px Arial, sans-serif';
    }

    function lineWidth(text, font, size) {
      try { return font.widthOfTextAtSize(text, size); }
      catch { measure.font = canvasFont(font,size); return measure.measureText(text).width; }
    }

    function wrap(text, max, font, size) {
      const lines = [];
      let line = '';
      for (const word of text.trim().split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (lineWidth(next, font, size) <= max) { line = next; continue; }
        if (line) lines.push(line);
        line = '';
        for (const char of word) {
          if (line && lineWidth(line + char, font, size) > max) { lines.push(line); line = ''; }
          line += char;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    async function drawLine(text, x, base, font, size) {
      try { font.encodeText(text); }
      catch {
        const canvas = document.createElement('canvas');
        const span = lineWidth(text,font,size) + 2;
        canvas.width = Math.ceil(span * 3);
        canvas.height = Math.ceil(size * 5);
        const ctx = canvas.getContext('2d');
        ctx.scale(3,3);
        ctx.font = canvasFont(font,size);
        ctx.fillStyle = '#172e25';
        ctx.fillText(text,0,size);
        const image = await pdf.embedPng(canvas.toDataURL('image/png'));
        page.drawImage(image,{x,y:base-size*2/3,width:span,height:size*5/3});
        return;
      }
      page.drawText(text,{x,y:base,font,size,color:ink});
    }

    async function paragraph(text, size = 11, font = normal) {
      const lines = wrap(text,usable,font,size);
      for (const line of lines) {
        reserve(size+6);
        await drawLine(line,margin,y-size,font,size);
        y -= size+4;
      }
      if (lines.length) y -= 5;
    }

    async function table(node) {
      const rows = Array.from(node.rows);
      if (!rows.length) return;
      const count = Math.max(...rows.map(row => row.cells.length));
      const first = count === 1 ? usable : usable * .25;
      const columns = [first,...Array(Math.max(0,count-1)).fill((usable-first)/Math.max(1,count-1))];
      const header = rows[0].cells[0]?.tagName === 'TH' ? rows.shift() : null;
      const size = 9, step = 13;
      function cells(row, font) {
        return Array.from(row.cells, (cell,i) => wrap(cell.textContent.replace(/\s+/g,' ').replace(/(%)(\d)/g,'$1 · $2'),columns[i]-12,font,size));
      }
      const headerLines = header ? cells(header,bold) : [];
      const rowHeight = lines => Math.max(1,...lines.map(cell => cell.length))*step+9;
      async function drawRow(lines,font,fill) {
        const space = rowHeight(lines);
        page.drawRectangle({x:margin,y:y-space,width:usable,height:space,color:fill});
        let x = margin;
        for (const [i,cell] of lines.entries()) {
          for (const [j,line] of cell.entries()) await drawLine(line,x+6,y-13-j*step,font,size);
          x += columns[i];
        }
        y -= space+1;
      }
      if (header) {
        reserve(rowHeight(headerLines)+32);
        await drawRow(headerLines,bold,rgb(.86,.92,.88));
      }
      for (const [i,row] of rows.entries()) {
        const lines = cells(row,normal);
        const maxLines = Math.floor((height-2*margin-50)/step) - headerLines.reduce((n,cell) => Math.max(n,cell.length),0);
        const length = Math.max(1,...lines.map(cell => cell.length));
        for (let start=0; start<length; start+=maxLines) {
          const chunk = lines.map(cell => cell.slice(start,start+maxLines));
          if (y-rowHeight(chunk) < margin) {
            newPage();
            if (header) await drawRow(headerLines,bold,rgb(.86,.92,.88));
          }
          await drawRow(chunk,normal,i%2 ? pale : rgb(.98,.99,.98));
        }
      }
      y -= 10;
    }

    async function chart(node) {
      let canvas = node;
      if (node.tagName.toLowerCase() === 'svg') {
        const [,,w,h] = node.getAttribute('viewBox').trim().split(/\s+/).map(Number);
        if (!(w > 0 && h > 0)) return;
        node.setAttribute('width',w);
        node.setAttribute('height',h);
        node.setAttribute('color','#183b2c');
        const image = new Image();
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(node)],{type:'image/svg+xml'}));
        try {
          await new Promise((resolve,reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
          });
          canvas = document.createElement('canvas');
          canvas.width = w*2;
          canvas.height = h*2;
          canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        } finally { URL.revokeObjectURL(url); }
      }
      const aspect = canvas.width/canvas.height;
      const w = Math.min(usable,node.classList.contains('donut')?120:usable,260*aspect);
      const h = w/aspect;
      reserve(h+12);
      const image = await pdf.embedPng(canvas.toDataURL('image/png'));
      page.drawImage(image,{x:margin+(usable-w)/2,y:y-h,width:w,height:h});
      y -= h+12;
    }

    async function visit(node) {
      if (node.nodeType !== Node.ELEMENT_NODE || node.hidden) return;
      const tag = node.tagName.toLowerCase();
      if (['button','input','label'].includes(tag)) return;
      if (tag === 'select') {
        if (node.selectedOptions[0]?.textContent) await paragraph(node.selectedOptions[0].textContent);
      } else if (tag === 'table') await table(node);
      else if (tag === 'svg' || tag === 'canvas') await chart(node);
      else if (/^h[1-6]$/.test(tag)) {
        reserve(62);
        await paragraph(node.textContent,tag === 'h2'?17:14,bold);
      } else if (node.matches('.reporthero,.kpi,.metric,.rankrow,.rotrow120')) {
        await paragraph(Array.from(node.childNodes).map(child=>child.textContent.trim()).filter(Boolean).join(' · '),
          node.matches('.reporthero')?15:11,node.matches('.reporthero')?bold:normal);
      } else if (node.children.length === 0 || tag === 'p') {
        await paragraph(node.textContent);
      } else {
        for (const child of node.children) await visit(child);
      }
    }

    newPage();
    await paragraph(report.title,24,bold);
    await paragraph([report.report,...report.context].filter(Boolean).join(' · '),12);
    for (const node of report.chartNodes) await visit(node);
    const name = (report.name || 'Volleyball').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').trim().slice(0,70);
    return new File([await pdf.save()], `${name || 'Volleyball'} - ${report.title}.pdf`, {type:'application/pdf'});
  }

  async function prepare(complete) {
    const request = ++generation;
    file = undefined;
    shareButton.hidden = downloadButton.hidden = true;
    status.textContent = 'PDF wird erstellt …';
    dialog.showModal();
    try {
      const report = snapshot(complete);
      const result = await createPdf(report);
      if (request !== generation) return;
      file = result;
      downloadButton.hidden = false;
      shareButton.hidden = !navigator.share || !navigator.canShare?.({files:[file]});
      status.textContent = shareButton.hidden
        ? 'PDF ist fertig. Du kannst es herunterladen.'
        : 'PDF ist fertig. Wähle im Teilen-Menü zum Beispiel AirDrop oder Mail.';
    } catch (error) {
      if (request === generation) status.textContent = 'Das PDF konnte nicht erstellt werden. Bitte versuche es erneut.';
      console.error('PDF-Export',error);
    }
  }

  $('pdf').onclick = () => prepare(false);
  $('fullpdf').onclick = () => prepare(true);
  $('pdf-close').onclick = () => dialog.close();
  dialog.addEventListener('close',() => { generation++; file = undefined; });
  shareButton.onclick = async () => {
    if (!file) return;
    try { await navigator.share({files:[file]}); }
    catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'Teilen war nicht möglich. Du kannst das PDF herunterladen.';
    }
  };
  downloadButton.onclick = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url),30000);
  };
})();
