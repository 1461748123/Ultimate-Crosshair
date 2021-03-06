/* */ 
(function(Buffer) {
  var assert = require("assert-plus");
  var crypto = require("crypto");
  var asn1 = require("asn1");
  var ctype = require("ctype");
  function readNext(buffer, offset) {
    var len = ctype.ruint32(buffer, 'big', offset);
    offset += 4;
    var newOffset = offset + len;
    return {
      data: buffer.slice(offset, newOffset),
      offset: newOffset
    };
  }
  function writeInt(writer, buffer) {
    writer.writeByte(0x02);
    writer.writeLength(buffer.length);
    for (var i = 0; i < buffer.length; i++)
      writer.writeByte(buffer[i]);
    return writer;
  }
  function rsaToPEM(key) {
    var buffer;
    var der;
    var exponent;
    var i;
    var modulus;
    var newKey = '';
    var offset = 0;
    var type;
    var tmp;
    try {
      buffer = new Buffer(key.split(' ')[1], 'base64');
      tmp = readNext(buffer, offset);
      type = tmp.data.toString();
      offset = tmp.offset;
      if (type !== 'ssh-rsa')
        throw new Error('Invalid ssh key type: ' + type);
      tmp = readNext(buffer, offset);
      exponent = tmp.data;
      offset = tmp.offset;
      tmp = readNext(buffer, offset);
      modulus = tmp.data;
    } catch (e) {
      throw new Error('Invalid ssh key: ' + key);
    }
    der = new asn1.BerWriter();
    der.startSequence();
    der.startSequence();
    der.writeOID('1.2.840.113549.1.1.1');
    der.writeNull();
    der.endSequence();
    der.startSequence(0x03);
    der.writeByte(0x00);
    der.startSequence();
    writeInt(der, modulus);
    writeInt(der, exponent);
    der.endSequence();
    der.endSequence();
    der.endSequence();
    tmp = der.buffer.toString('base64');
    for (i = 0; i < tmp.length; i++) {
      if ((i % 64) === 0)
        newKey += '\n';
      newKey += tmp.charAt(i);
    }
    if (!/\\n$/.test(newKey))
      newKey += '\n';
    return '-----BEGIN PUBLIC KEY-----' + newKey + '-----END PUBLIC KEY-----\n';
  }
  function dsaToPEM(key) {
    var buffer;
    var offset = 0;
    var tmp;
    var der;
    var newKey = '';
    var type;
    var p;
    var q;
    var g;
    var y;
    try {
      buffer = new Buffer(key.split(' ')[1], 'base64');
      tmp = readNext(buffer, offset);
      type = tmp.data.toString();
      offset = tmp.offset;
      if (!/^ssh-ds[as].*/.test(type))
        throw new Error('Invalid ssh key type: ' + type);
      tmp = readNext(buffer, offset);
      p = tmp.data;
      offset = tmp.offset;
      tmp = readNext(buffer, offset);
      q = tmp.data;
      offset = tmp.offset;
      tmp = readNext(buffer, offset);
      g = tmp.data;
      offset = tmp.offset;
      tmp = readNext(buffer, offset);
      y = tmp.data;
    } catch (e) {
      console.log(e.stack);
      throw new Error('Invalid ssh key: ' + key);
    }
    der = new asn1.BerWriter();
    der.startSequence();
    der.startSequence();
    der.writeOID('1.2.840.10040.4.1');
    der.startSequence();
    writeInt(der, p);
    writeInt(der, q);
    writeInt(der, g);
    der.endSequence();
    der.endSequence();
    der.startSequence(0x03);
    der.writeByte(0x00);
    writeInt(der, y);
    der.endSequence();
    der.endSequence();
    tmp = der.buffer.toString('base64');
    for (var i = 0; i < tmp.length; i++) {
      if ((i % 64) === 0)
        newKey += '\n';
      newKey += tmp.charAt(i);
    }
    if (!/\\n$/.test(newKey))
      newKey += '\n';
    return '-----BEGIN PUBLIC KEY-----' + newKey + '-----END PUBLIC KEY-----\n';
  }
  module.exports = {
    sshKeyToPEM: function sshKeyToPEM(key) {
      assert.string(key, 'ssh_key');
      if (/^ssh-rsa.*/.test(key))
        return rsaToPEM(key);
      if (/^ssh-ds[as].*/.test(key))
        return dsaToPEM(key);
      throw new Error('Only RSA and DSA public keys are allowed');
    },
    fingerprint: function fingerprint(key) {
      assert.string(key, 'ssh_key');
      var pieces = key.split(' ');
      if (!pieces || !pieces.length || pieces.length < 2)
        throw new Error('invalid ssh key');
      var data = new Buffer(pieces[1], 'base64');
      var hash = crypto.createHash('md5');
      hash.update(data);
      var digest = hash.digest('hex');
      var fp = '';
      for (var i = 0; i < digest.length; i++) {
        if (i && i % 2 === 0)
          fp += ':';
        fp += digest[i];
      }
      return fp;
    },
    pemToRsaSSHKey: function pemToRsaSSHKey(pem, comment) {
      assert.equal('string', typeof(pem), 'typeof pem');
      var cleaned = pem.split('\n').slice(1, -2).join('');
      var buf = new Buffer(cleaned, 'base64');
      var der = new asn1.BerReader(buf);
      der.readSequence();
      der.readSequence();
      var oid = der.readOID();
      assert.equal(oid, '1.2.840.113549.1.1.1', 'pem not in RSA format');
      der.readByte();
      der.readByte();
      der.readSequence(0x03);
      der.readByte();
      der.readSequence();
      assert.equal(der.peek(), asn1.Ber.Integer, 'modulus not an integer');
      der._offset = der.readLength(der.offset + 1);
      var modulus = der._buf.slice(der.offset, der.offset + der.length);
      der._offset += der.length;
      assert.equal(der.peek(), asn1.Ber.Integer, 'exponent not an integer');
      der._offset = der.readLength(der.offset + 1);
      var exponent = der._buf.slice(der.offset, der.offset + der.length);
      der._offset += der.length;
      var type = new Buffer('ssh-rsa');
      var buffer = new Buffer(4 + type.length + 4 + modulus.length + 4 + exponent.length);
      var i = 0;
      buffer.writeUInt32BE(type.length, i);
      i += 4;
      type.copy(buffer, i);
      i += type.length;
      buffer.writeUInt32BE(exponent.length, i);
      i += 4;
      exponent.copy(buffer, i);
      i += exponent.length;
      buffer.writeUInt32BE(modulus.length, i);
      i += 4;
      modulus.copy(buffer, i);
      i += modulus.length;
      var s = (type.toString() + ' ' + buffer.toString('base64') + ' ' + (comment || ''));
      return s;
    }
  };
})(require("buffer").Buffer);
