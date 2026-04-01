package logging

import "go.uber.org/zap/zapcore"

type entryFilter func(entry zapcore.Entry) bool

type filteredCore struct {
	core   zapcore.Core
	filter entryFilter
}

func newFilteredCore(core zapcore.Core, filter entryFilter) zapcore.Core {
	return &filteredCore{
		core:   core,
		filter: filter,
	}
}

func (c *filteredCore) Enabled(level zapcore.Level) bool {
	return c.core.Enabled(level)
}

func (c *filteredCore) With(fields []zapcore.Field) zapcore.Core {
	return &filteredCore{
		core:   c.core.With(fields),
		filter: c.filter,
	}
}

func (c *filteredCore) Check(entry zapcore.Entry, ce *zapcore.CheckedEntry) *zapcore.CheckedEntry {
	if c.filter != nil && !c.filter(entry) {
		return ce
	}
	return c.core.Check(entry, ce)
}

func (c *filteredCore) Write(entry zapcore.Entry, fields []zapcore.Field) error {
	if c.filter != nil && !c.filter(entry) {
		return nil
	}
	return c.core.Write(entry, fields)
}

func (c *filteredCore) Sync() error {
	return c.core.Sync()
}
