import { AGENT_ICONS } from './AgentIcon'

interface IconPickerProps {
  value: string
  onChange: (icon: string) => void
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="icon-picker">
      {AGENT_ICONS.map(({ name, Icon }) => (
        <button
          key={name}
          type="button"
          className={`icon-picker-item ${value === name ? 'active' : ''}`}
          onClick={() => onChange(name)}
          title={name}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  )
}
