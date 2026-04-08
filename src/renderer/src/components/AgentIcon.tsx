import {
  Bot, Brain, Cpu, Terminal, Zap, Sparkles, Code, Wrench, Palette,
  Rocket, Shield, Eye, Lightbulb, Compass, Globe, Heart, Star,
  Flame, Gem, Wand2, type LucideIcon
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
  { name: 'palette', Icon: Palette },
  { name: 'rocket', Icon: Rocket },
  { name: 'shield', Icon: Shield },
  { name: 'eye', Icon: Eye },
  { name: 'lightbulb', Icon: Lightbulb },
  { name: 'compass', Icon: Compass },
  { name: 'globe', Icon: Globe },
  { name: 'heart', Icon: Heart },
  { name: 'star', Icon: Star },
  { name: 'flame', Icon: Flame },
  { name: 'gem', Icon: Gem },
  { name: 'wand', Icon: Wand2 },
]

const iconMap = new Map(AGENT_ICONS.map(i => [i.name, i.Icon]))

export function AgentIcon({ icon, size = 16 }: { icon: string; size?: number }) {
  const IconComponent = iconMap.get(icon) ?? Bot
  return <IconComponent size={size} />
}
