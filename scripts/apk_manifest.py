"""Small read-only Android binary XML decoder for APK audit assertions."""
import struct
import xml.etree.ElementTree as ET


def decode(data):
    if len(data) < 8 or struct.unpack_from('<H', data)[0] != 3:
        raise ValueError('Expected Android binary XML')
    strings, stack, root = [], [], None
    offset = struct.unpack_from('<H', data, 2)[0]
    while offset < len(data):
        kind, header, size = struct.unpack_from('<HHI', data, offset)
        if size < header or size < 8 or offset + size > len(data):
            raise ValueError('Invalid XML chunk')
        chunk = data[offset:offset + size]
        if kind == 1:
            count, _, flags, start, _ = struct.unpack_from('<IIIII', chunk, 8)
            if count > (size - header) // 4:
                raise ValueError('Invalid string pool')
            def length(pos, utf8):
                if utf8:
                    value = chunk[pos]; pos += 1
                    if value & 128:
                        value = ((value & 127) << 8) | chunk[pos]; pos += 1
                else:
                    value = struct.unpack_from('<H', chunk, pos)[0]; pos += 2
                    if value & 32768:
                        value = ((value & 32767) << 16) | struct.unpack_from('<H', chunk, pos)[0]; pos += 2
                return value, pos
            for i in range(count):
                pos = start + struct.unpack_from('<I', chunk, header + 4 * i)[0]
                chars, pos = length(pos, bool(flags & 256))
                if flags & 256:
                    size_bytes, pos = length(pos, True)
                    strings.append(chunk[pos:pos + size_bytes].decode('utf-8'))
                else:
                    strings.append(chunk[pos:pos + 2 * chars].decode('utf-16-le'))
        elif kind == 0x102:
            _, name, attr_start, attr_size, count = struct.unpack_from('<IIHHH', chunk, 16)
            element = ET.Element(strings[name])
            for i in range(count):
                pos = 16 + attr_start + i * attr_size
                _, attr_name, raw = struct.unpack_from('<III', chunk, pos)
                value_type = chunk[pos + 15]; value_data = struct.unpack_from('<I', chunk, pos + 16)[0]
                if raw != 0xffffffff: value = strings[raw]
                elif value_type == 3: value = strings[value_data]
                elif value_type == 0x12: value = 'true' if value_data else 'false'
                elif value_type in (0x10, 0x11): value = str(value_data)
                elif value_type == 1: value = '@' + hex(value_data)
                else: value = hex(value_data)
                element.set(strings[attr_name], value)
            if stack: stack[-1].append(element)
            else: root = element
            stack.append(element)
        elif kind == 0x103:
            if not stack: raise ValueError('Unbalanced XML')
            stack.pop()
        offset += size
    if root is None or stack: raise ValueError('Incomplete XML')
    return root
