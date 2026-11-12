(function () {
  if (!window.CMS || !window.CMS.registerEditorComponent) return;

  var h = window.h || window.React.createElement;
  var boxStyles = [
    { value: 'soft-green', label: 'Soft green' },
    { value: 'warm-cream', label: 'Warm cream' },
    { value: 'deep-green', label: 'Deep green' },
    { value: 'bordered', label: 'Elegant border' },
    { value: 'minimal', label: 'Minimal editorial' }
  ];

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function decodeHtml(value) {
    var node = document.createElement('textarea');
    node.innerHTML = value || '';
    return node.value;
  }

  function plainText(html) {
    return decodeHtml(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
  }

  function paragraphs(value) {
    return String(value || '').trim().split(/\n\s*\n/).filter(Boolean).map(function (part) {
      return '<p>' + escapeHtml(part).replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
  }

  function boxPreview(data) {
    var style = boxStyles.some(function (item) { return item.value === data.style; }) ? data.style : 'soft-green';
    var children = [];
    if (data.heading) children.push(h('h3', { key: 'heading' }, data.heading));
    String(data.text || '').split(/\n\s*\n/).filter(Boolean).forEach(function (paragraph, index) {
      children.push(h('p', { key: 'p' + index }, paragraph));
    });
    return h('aside', { className: 'torch-editorial-box torch-editorial-box--' + style }, children);
  }

  window.CMS.registerEditorComponent({
    id: 'torch-captioned-image',
    label: 'Image with caption',
    fields: [
      { name: 'image', label: 'Image', widget: 'image' },
      { name: 'alt', label: 'Image description (accessibility)', widget: 'string', required: false },
      { name: 'caption', label: 'Caption', widget: 'string', required: false },
      { name: 'alignment', label: 'Image placement', widget: 'select', options: ['wide', 'center', 'left', 'right'], default: 'wide' }
    ],
    pattern: /^<figure class=\"torch-article-image torch-article-image--(wide|center|left|right)\">\s*<img src=\"([^\"]+)\" alt=\"([^\"]*)\">\s*(?:<figcaption>([\s\S]*?)<\/figcaption>\s*)?<\/figure>$/,
    fromBlock: function (match) {
      return { alignment: match[1], image: decodeHtml(match[2]), alt: plainText(match[3]), caption: match[4] ? plainText(match[4]) : '' };
    },
    toBlock: function (data) {
      var alignment = ['wide', 'center', 'left', 'right'].indexOf(data.alignment) >= 0 ? data.alignment : 'wide';
      if (!data.image) return '';
      var caption = data.caption ? '<figcaption>' + escapeHtml(data.caption) + '</figcaption>\n' : '';
      return '<figure class=\"torch-article-image torch-article-image--' + alignment + '\">\n<img src=\"' + escapeHtml(data.image) + '\" alt=\"' + escapeHtml(data.alt || '') + '\">\n' + caption + '</figure>';
    },
    toPreview: function (data) {
      var alignment = ['wide', 'center', 'left', 'right'].indexOf(data.alignment) >= 0 ? data.alignment : 'wide';
      return h('figure', { className: 'torch-article-image torch-article-image--' + alignment },
        h('img', { src: data.image || '', alt: data.alt || '' }),
        data.caption ? h('figcaption', {}, data.caption) : null
      );
    }
  });

  window.CMS.registerEditorComponent({
    id: 'torch-editorial-box',
    label: 'Editorial paragraph box',
    fields: [
      { name: 'style', label: 'Box design', widget: 'select', options: boxStyles.map(function (item) { return item.value; }), default: 'soft-green' },
      { name: 'heading', label: 'Optional heading', widget: 'string', required: false },
      { name: 'text', label: 'Paragraph text', widget: 'text' }
    ],
    pattern: /^<aside class="torch-editorial-box torch-editorial-box--(soft-green|warm-cream|deep-green|bordered|minimal)">\s*(?:<h3>([\s\S]*?)<\/h3>\s*)?<div class="torch-editorial-box__body">([\s\S]*?)<\/div>\s*<\/aside>$/,
    fromBlock: function (match) {
      return {
        style: match[1],
        heading: match[2] ? plainText(match[2]) : '',
        text: plainText(match[3]).replace(/\n{3,}/g, '\n\n')
      };
    },
    toBlock: function (data) {
      var style = boxStyles.some(function (item) { return item.value === data.style; }) ? data.style : 'soft-green';
      var heading = data.heading ? '<h3>' + escapeHtml(data.heading) + '</h3>\n' : '';
      return '<aside class="torch-editorial-box torch-editorial-box--' + style + '">\n' + heading + '<div class="torch-editorial-box__body">\n' + paragraphs(data.text) + '\n</div>\n</aside>';
    },
    toPreview: boxPreview
  });

  var highlights = [
    { id: 'torch-highlight-soft', label: 'Sentence highlight: Soft green', style: 'soft' },
    { id: 'torch-highlight-gold', label: 'Sentence highlight: Golden marker', style: 'gold' },
    { id: 'torch-highlight-underline', label: 'Sentence highlight: Editorial underline', style: 'underline' },
    { id: 'torch-highlight-rose', label: 'Sentence highlight: Warm accent', style: 'rose' },
    { id: 'torch-highlight-bold', label: 'Sentence highlight: Bold green', style: 'bold' }
  ];

  highlights.forEach(function (item) {
    var className = 'torch-highlight torch-highlight--' + item.style;
    window.CMS.registerEditorComponent({
      id: item.id,
      label: item.label,
      type: 'inline',
      trigger: '<span',
      pattern: new RegExp('<span class="torch-highlight torch-highlight--' + item.style + '">(.*?)<\\/span>'),
      fromInline: function (match) { return { text: plainText(match[1]) }; },
      toInline: function (data) { return '<span class="' + className + '">' + escapeHtml(data.text) + '</span>'; },
      onInsert: function (context) {
        var selected = String((context && context.selectedText) || '').trim();
        if (selected) return Promise.resolve({ text: selected });
        var entered = window.prompt('Type the sentence you want to highlight:');
        return Promise.resolve(entered ? { text: entered } : null);
      },
      onEdit: function (context) {
        return Promise.resolve(context && context.data ? context.data : null);
      },
      toPreview: function (data) {
        return h('span', { className: className }, data.text || 'Highlighted sentence');
      }
    });
  });
})();
