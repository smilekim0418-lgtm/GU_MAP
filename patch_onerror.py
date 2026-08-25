import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

onerror_code = """
window.onerror = function(msg, url, lineNo, columnNo, error) {
  var string = msg.toLowerCase();
  var substring = "script error";
  if (string.indexOf(substring) > -1){
    alert('Script Error: See Browser Console for Detail');
  } else {
    var message = [
      'Message: ' + msg,
      'URL: ' + url,
      'Line: ' + lineNo,
      'Column: ' + columnNo,
      'Error object: ' + JSON.stringify(error)
    ].join(' - ');
    alert(message);
    document.body.innerHTML += '<div style="color:red; z-index:9999; position:absolute; top:0; left:0; background:white; padding:20px;">' + message + '</div>';
  }
  return false;
};
"""

if 'window.onerror' not in text:
    text = text.replace('<script>', '<script>\n' + onerror_code)
    codecs.open(fpath, 'w', encoding='utf-8').write(text)
    print("Injected onerror handler!")
else:
    print("Already injected")
