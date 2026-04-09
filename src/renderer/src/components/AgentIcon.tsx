import {
  Bot, Brain, Cpu, Terminal, Zap, Sparkles, Code, Wrench,
  Rocket, Shield, Eye, Wand2, Pencil, Palette, type LucideIcon
} from 'lucide-react'

export const AGENT_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'bot', Icon: Bot },
  { name: 'brain', Icon: Brain },
  { name: 'cpu', Icon: Cpu },
  { name: 'terminal', Icon: Terminal },
  { name: 'zap', Icon: Zap },
  { name: 'sparkles', Icon: Sparkles },
  { name: 'code', Icon: Code },
  { name: 'wrench', Icon: Wrench },
  { name: 'rocket', Icon: Rocket },
  { name: 'shield', Icon: Shield },
  { name: 'eye', Icon: Eye },
  { name: 'wand', Icon: Wand2 },
  { name: 'pencil', Icon: Pencil },
  { name: 'palette', Icon: Palette },
]

const iconMap = new Map(AGENT_ICONS.map(i => [i.name, i.Icon]))

export function AgentIcon({ icon, size = 16 }: { icon: string; size?: number }) {
  const IconComponent = iconMap.get(icon) ?? Bot
  return <IconComponent size={size} />
}
