package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"strings"
)

// HPROF 记录类型
const (
	TagString      = 0x01
	TagLoadClass   = 0x02
	TagStackFrame  = 0x04
	TagStackTrace  = 0x05
	TagHeapDump    = 0x0C
	TagHeapDumpSeg = 0x1C
	TagHeapDumpEnd = 0x2C
)

// Heap Dump 子记录类型
const (
	SubRootUnknown     = 0xFF
	SubRootJNIglobal   = 0x01
	SubRootJNIlocal    = 0x02
	SubRootJavaFrame   = 0x03
	SubRootNativeStack = 0x04
	SubRootStickyClass = 0x05
	SubRootThreadBlock = 0x06
	SubRootMonitorUsed = 0x07
	SubThreadObject    = 0x08
	SubClassDump       = 0x20
	SubInstanceDump    = 0x21
	SubObjArrayDump    = 0x22
	SubPrimArrayDump   = 0x23
)

// 类型大小映射（不包含 object 引用，引用大小为 idSize）
var primTypeSizes = map[byte]int{
	4:  1, // boolean
	5:  2, // char
	6:  4, // float
	7:  8, // double
	8:  1, // byte
	9:  2, // short
	10: 4, // int
	11: 8, // long
}

// HPROFParser HPROF 解析器
type HPROFParser struct {
	reader    io.ReadSeeker
	idSize    int
	strings   map[uint64]string
	classes   map[uint64]*ClassInfo
	instances []*InstanceInfo
	arrays    []*ArrayInfo
	gcRoots   int
	byteOrder binary.ByteOrder
}

// ClassInfo 类信息
type ClassInfo struct {
	ID            uint64
	Name          string
	Fields        []FieldInfo
	InstanceSize  int
	InstanceCount int
	TotalSize     int64
}

// FieldInfo 字段信息
type FieldInfo struct {
	Name string
	Type byte
}

// InstanceInfo 实例信息
type InstanceInfo struct {
	ClassID uint64
	Size    int
}

// ArrayInfo 数组信息
type ArrayInfo struct {
	ElementType byte
	Length      int
	Size        int
}

// NewHPROFParser 创建解析器
func NewHPROFParser(reader io.ReadSeeker) *HPROFParser {
	return &HPROFParser{
		reader:    reader,
		strings:   make(map[uint64]string),
		classes:   make(map[uint64]*ClassInfo),
		instances: make([]*InstanceInfo, 0),
		arrays:    make([]*ArrayInfo, 0),
		byteOrder: binary.BigEndian,
	}
}

// Parse 解析 HPROF 文件
func (p *HPROFParser) Parse() (*HeapStats, error) {
	// 读取头部: "JAVA PROFILE 1.0.1\0" + 4字节ID大小 + 8字节时间戳
	// 先读取直到 null 终止符
	headerBuf := make([]byte, 0, 64)
	for {
		b := make([]byte, 1)
		if _, err := io.ReadFull(p.reader, b); err != nil {
			return nil, fmt.Errorf("读取头部失败: %w", err)
		}
		headerBuf = append(headerBuf, b[0])
		if b[0] == 0 {
			break
		}
		if len(headerBuf) > 64 {
			return nil, fmt.Errorf("头部过长")
		}
	}

	// 读取 ID 大小 (4字节)
	idSizeBuf := make([]byte, 4)
	if _, err := io.ReadFull(p.reader, idSizeBuf); err != nil {
		return nil, fmt.Errorf("读取 ID 大小失败: %w", err)
	}
	p.idSize = int(binary.BigEndian.Uint32(idSizeBuf))
	if p.idSize != 4 && p.idSize != 8 {
		return nil, fmt.Errorf("不支持的 ID 大小: %d", p.idSize)
	}

	// 跳过时间戳 (8字节)
	if _, err := readBytes(p.reader, 8); err != nil {
		return nil, fmt.Errorf("跳过时间戳失败: %w", err)
	}

	// 读取记录
	for {
		tag, err := readByte(p.reader)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("读取记录标签失败: %w", err)
		}

		// 跳过时间戳
		if _, err := readBytes(p.reader, 4); err != nil {
			return nil, err
		}

		// 读取长度
		length, err := readUint32(p.reader, p.byteOrder)
		if err != nil {
			return nil, err
		}

		switch tag {
		case TagString:
			if err := p.parseString(length); err != nil {
				return nil, err
			}
		case TagLoadClass:
			if err := p.parseLoadClass(); err != nil {
				return nil, err
			}
		case TagHeapDump, TagHeapDumpSeg:
			if err := p.parseHeapDump(length); err != nil {
				return nil, err
			}
		default:
			// 跳过其他记录
			if _, err := readBytes(p.reader, int(length)); err != nil {
				return nil, err
			}
		}
	}

	return p.buildStats(), nil
}

func (p *HPROFParser) parseString(length uint32) error {
	id, err := readID(p.reader, p.idSize)
	if err != nil {
		return err
	}
	strBytes := make([]byte, length-uint32(p.idSize))
	if _, err := io.ReadFull(p.reader, strBytes); err != nil {
		return err
	}
	p.strings[id] = string(strBytes)
	return nil
}

func (p *HPROFParser) parseLoadClass() error {
	if _, err := readBytes(p.reader, 4); err != nil {
		return err
	}
	classID, err := readID(p.reader, p.idSize)
	if err != nil {
		return err
	}
	if _, err := readBytes(p.reader, 4); err != nil {
		return err
	}
	classNameID, err := readID(p.reader, p.idSize)
	if err != nil {
		return err
	}

	name := p.strings[classNameID]
	name = strings.ReplaceAll(name, "/", ".")

	if _, exists := p.classes[classID]; !exists {
		p.classes[classID] = &ClassInfo{
			ID:   classID,
			Name: name,
		}
	} else {
		p.classes[classID].Name = name
	}
	return nil
}

func (p *HPROFParser) parseHeapDump(length uint32) error {
	endPos, _ := p.reader.Seek(0, io.SeekCurrent)
	endPos += int64(length)

	for {
		pos, _ := p.reader.Seek(0, io.SeekCurrent)
		if pos >= endPos {
			break
		}

		subTag, err := readByte(p.reader)
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		switch subTag {
		case SubRootUnknown:
			p.gcRoots++
			if _, err := readID(p.reader, p.idSize); err != nil {
				return err
			}
		case SubRootJNIglobal, SubRootJNIlocal, SubRootJavaFrame,
			SubRootNativeStack, SubRootStickyClass, SubRootThreadBlock, SubRootMonitorUsed:
			p.gcRoots++
			// 所有 GC Root 都有 object ID
			if _, err := readID(p.reader, p.idSize); err != nil {
				return err
			}
			// 按 HPROF 规范读取额外字段
			switch subTag {
			case SubRootJNIglobal:
				// JNI global ref ID (idSize)
				if _, err := readID(p.reader, p.idSize); err != nil {
					return err
				}
			case SubRootJNIlocal, SubRootJavaFrame:
				// thread serial (u4) + frame number (u4)
				if _, err := readBytes(p.reader, 8); err != nil {
					return err
				}
			case SubRootNativeStack, SubRootThreadBlock:
				// thread serial (u4)
				if _, err := readBytes(p.reader, 4); err != nil {
					return err
				}
				// SubRootStickyClass, SubRootMonitorUsed: 无额外字段
			}
		case SubThreadObject:
			p.gcRoots++
			if _, err := readID(p.reader, p.idSize); err != nil {
				return err
			}
			if _, err := readBytes(p.reader, 8); err != nil {
				return err
			}
		case SubClassDump:
			if err := p.parseClassDump(); err != nil {
				return err
			}
		case SubInstanceDump:
			if err := p.parseInstanceDump(); err != nil {
				return err
			}
		case SubObjArrayDump:
			if err := p.parseObjArrayDump(); err != nil {
				return err
			}
		case SubPrimArrayDump:
			if err := p.parsePrimArrayDump(); err != nil {
				return err
			}
		default:
			return fmt.Errorf("未知的堆转储子记录类型: 0x%02x", subTag)
		}
	}
	return nil
}

func (p *HPROFParser) parseClassDump() error {
	classID, err := readID(p.reader, p.idSize)
	if err != nil {
		return err
	}

	// stack trace serial (4 bytes)
	if _, err := readBytes(p.reader, 4); err != nil {
		return err
	}

	superClassID, err := readID(p.reader, p.idSize)
	if err != nil {
		return err
	}
	_ = superClassID

	// skip: class loader + signers + protection domain + 2 reserved = 5 * idSize
	// then instance size (4 bytes)
	if _, err := readBytes(p.reader, p.idSize*5+4); err != nil {
		return err
	}

	// Constant pool: u2 count, then repeated u2 index + typed value.
	constantPoolCount, err := readUint16(p.reader, p.byteOrder)
	if err != nil {
		return err
	}
	for i := 0; i < int(constantPoolCount); i++ {
		if _, err := readBytes(p.reader, 2); err != nil {
			return err
		}
		valueType, err := readByte(p.reader)
		if err != nil {
			return err
		}
		if _, err := readBytes(p.reader, p.valueSize(valueType)); err != nil {
			return err
		}
	}

	class := p.classes[classID]
	if class == nil {
		class = &ClassInfo{ID: classID}
		p.classes[classID] = class
	}

	// Static fields: u2 count, then field name ID + type + typed value.
	staticFieldCount, err := readUint16(p.reader, p.byteOrder)
	if err != nil {
		return err
	}
	for i := 0; i < int(staticFieldCount); i++ {
		if _, err := readID(p.reader, p.idSize); err != nil {
			return err
		}
		fieldType, err := readByte(p.reader)
		if err != nil {
			return err
		}
		if _, err := readBytes(p.reader, p.valueSize(fieldType)); err != nil {
			return err
		}
	}

	// Instance fields: u2 count, then field name ID + type.
	instanceFieldCount, err := readUint16(p.reader, p.byteOrder)
	if err != nil {
		return err
	}
	class.Fields = make([]FieldInfo, instanceFieldCount)
	for i := 0; i < int(instanceFieldCount); i++ {
		if _, err := readID(p.reader, p.idSize); err != nil {
			return err
		}
		fieldType, err := readByte(p.reader)
		if err != nil {
			return err
		}
		class.Fields[i] = FieldInfo{Type: fieldType}
	}

	// 计算实例大小
	size := 0
	for _, f := range class.Fields {
		if f.Type == 2 {
			size += p.idSize
		} else {
			size += primTypeSizes[f.Type]
		}
	}
	class.InstanceSize = size

	return nil
}

func (p *HPROFParser) valueSize(valueType byte) int {
	if valueType == 2 {
		return p.idSize
	}
	return primTypeSizes[valueType]
}

func (p *HPROFParser) parseInstanceDump() error {
	if _, err := readID(p.reader, p.idSize); err != nil {
		return err
	}
	if _, err := readBytes(p.reader, 4); err != nil {
		return err
	}
	classID, err := readID(p.reader, p.idSize)
	if err != nil {
		return err
	}
	dataLen, err := readUint32(p.reader, p.byteOrder)
	if err != nil {
		return err
	}

	p.instances = append(p.instances, &InstanceInfo{
		ClassID: classID,
		Size:    int(dataLen) + p.idSize + 4, // + 对象头
	})

	if class, ok := p.classes[classID]; ok {
		class.InstanceCount++
		class.TotalSize += int64(int(dataLen) + p.idSize + 4)
	}

	if _, err := readBytes(p.reader, int(dataLen)); err != nil {
		return err
	}
	return nil
}

func (p *HPROFParser) parseObjArrayDump() error {
	if _, err := readID(p.reader, p.idSize); err != nil {
		return err
	}
	if _, err := readBytes(p.reader, 4); err != nil {
		return err
	}
	length, err := readUint32(p.reader, p.byteOrder)
	if err != nil {
		return err
	}
	if _, err := readID(p.reader, p.idSize); err != nil {
		return err
	}

	p.arrays = append(p.arrays, &ArrayInfo{
		Length: int(length),
		Size:   int(length)*p.idSize + 16,
	})

	if _, err := readBytes(p.reader, int(length)*p.idSize); err != nil {
		return err
	}
	return nil
}

func (p *HPROFParser) parsePrimArrayDump() error {
	if _, err := readID(p.reader, p.idSize); err != nil {
		return err
	}
	if _, err := readBytes(p.reader, 4); err != nil {
		return err
	}
	length, err := readUint32(p.reader, p.byteOrder)
	if err != nil {
		return err
	}
	elemType, err := readByte(p.reader)
	if err != nil {
		return err
	}

	elemSize := primTypeSizes[elemType]
	arraySize := int(length) * elemSize

	p.arrays = append(p.arrays, &ArrayInfo{
		ElementType: elemType,
		Length:      int(length),
		Size:        arraySize + 16,
	})

	if _, err := readBytes(p.reader, arraySize); err != nil {
		return err
	}
	return nil
}

func (p *HPROFParser) buildStats() *HeapStats {
	stats := &HeapStats{
		GCRoots:    p.gcRoots,
		ClassCount: len(p.classes),
	}

	// 统计类信息
	classList := make([]ClassStats, 0, len(p.classes))
	for _, class := range p.classes {
		if class.InstanceCount > 0 {
			stats.InstanceCount += class.InstanceCount
			stats.TotalObjects += int64(class.InstanceCount)
			stats.TotalSize += class.TotalSize
			classList = append(classList, ClassStats{
				Name:          class.Name,
				InstanceCount: class.InstanceCount,
				TotalSize:     class.TotalSize,
				AvgSize:       class.TotalSize / int64(class.InstanceCount),
			})
		}
	}

	// 统计数组
	stats.ArrayCount = len(p.arrays)
	for _, arr := range p.arrays {
		stats.TotalObjects++
		stats.TotalSize += int64(arr.Size)
	}

	// Top 实例数
	sortClassStats(classList, func(a, b ClassStats) bool {
		return a.InstanceCount > b.InstanceCount
	})
	if len(classList) > 20 {
		classList = classList[:20]
	}
	stats.TopClasses = classList

	// Top 大小
	topSizes := make([]ClassStats, len(classList))
	copy(topSizes, classList)
	sortClassStats(topSizes, func(a, b ClassStats) bool {
		return a.TotalSize > b.TotalSize
	})
	if len(topSizes) > 20 {
		topSizes = topSizes[:20]
	}
	stats.TopSizes = topSizes

	stats.Summary = fmt.Sprintf(
		"共 %d 个对象 (%d 个实例, %d 个数组), %d 个类, GC Roots: %d, 总大小: %.2f MB",
		stats.TotalObjects, stats.InstanceCount, stats.ArrayCount,
		stats.ClassCount, stats.GCRoots, float64(stats.TotalSize)/1024/1024,
	)

	return stats
}

func sortClassStats(list []ClassStats, less func(a, b ClassStats) bool) {
	for i := 1; i < len(list); i++ {
		for j := i; j > 0 && less(list[j], list[j-1]); j-- {
			list[j], list[j-1] = list[j-1], list[j]
		}
	}
}

// 辅助函数

func readByte(r io.Reader) (byte, error) {
	buf := make([]byte, 1)
	_, err := io.ReadFull(r, buf)
	return buf[0], err
}

func readBytes(r io.Reader, n int) ([]byte, error) {
	buf := make([]byte, n)
	_, err := io.ReadFull(r, buf)
	return buf, err
}

func readUint16(r io.Reader, order binary.ByteOrder) (uint16, error) {
	buf := make([]byte, 2)
	_, err := io.ReadFull(r, buf)
	return order.Uint16(buf), err
}

func readUint32(r io.Reader, order binary.ByteOrder) (uint32, error) {
	buf := make([]byte, 4)
	_, err := io.ReadFull(r, buf)
	return order.Uint32(buf), err
}

func readID(r io.Reader, size int) (uint64, error) {
	buf := make([]byte, size)
	_, err := io.ReadFull(r, buf)
	if err != nil {
		return 0, err
	}
	switch size {
	case 4:
		return uint64(binary.BigEndian.Uint32(buf)), nil
	case 8:
		return binary.BigEndian.Uint64(buf), nil
	}
	return 0, fmt.Errorf("invalid id size: %d", size)
}
