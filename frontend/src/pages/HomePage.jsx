import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Vote, Trophy, BarChart2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

const cards = [
  {
    title: 'Elections',
    description: 'Run secure digital elections with audit-ready results and turnout analytics.',
    icon: Vote,
  },
  {
    title: 'Competitions',
    description: 'Score competitions with weighted criteria, judge panels, and live rankings.',
    icon: Trophy,
  },
  {
    title: 'Polling',
    description: 'Launch surveys and gather structured responses with clean analytics.',
    icon: BarChart2,
  },
]

export default function HomePage() {
  return (
    <section className="mx-auto max-w-6xl flex-1 px-4 py-12 md:py-16">
      <div className="text-center">
        <motion.h1
          className="text-3xl font-bold tracking-tight text-v-text md:text-4xl lg:text-5xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Online Voting, Polling &amp; Scoring
        </motion.h1>
        <motion.p
          className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-v-text-subtle md:text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          VOTRIX helps organizers run elections, competitions, and polls with role-based access for
          admins, organizers, and voters.
        </motion.p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/login/organizer">
            <Button size="lg">Organizer login</Button>
          </Link>
          <Link to="/login/voter">
            <Button variant="secondary" size="lg">
              Voter login
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-16 grid gap-6 md:grid-cols-3">
        {cards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + index * 0.08 }}
          >
            <Card className="h-full transition hover:border-v-border-strong">
              <div className="flex items-center gap-2">
                <card.icon className="h-5 w-5 text-v-text-subtle" strokeWidth={1.5} />
                <h2 className="v-section-title">{card.title}</h2>
              </div>
              <p className="v-caption mt-3 leading-relaxed">
                {card.description}
              </p>
            </Card>
          </motion.div>
        ))}
      </div>

      <p className="mt-12 text-center text-xs font-medium uppercase tracking-wider text-v-text-subtle">
        Every Vote Counts.
      </p>
    </section>
  )
}