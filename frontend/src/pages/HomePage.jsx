import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

const cards = [
  {
    title: 'Elections',
    description: 'Run secure digital elections with audit-ready results and turnout analytics.',
  },
  {
    title: 'Pageants',
    description: 'Score competitions with weighted criteria, judge panels, and live rankings.',
  },
  {
    title: 'Polling',
    description: 'Launch surveys and gather structured responses with clean analytics.',
  },
]

export default function HomePage() {
  return (
    <section className="mx-auto max-w-6xl flex-1 px-4 py-16 sm:px-6 sm:py-24">
      <div className="text-center">
        <motion.h1
          className="text-4xl font-bold tracking-tight text-v-text md:text-5xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Online Voting, Polling &amp; Scoring
        </motion.h1>
        <motion.p
          className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-v-text-subtle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          VOTRIX helps organizers run elections, pageants, and polls with role-based access for
          admins, organizers, and voters.
        </motion.p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
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

      <div className="mt-20 grid gap-6 md:grid-cols-3">
        {cards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + index * 0.08 }}
          >
            <Card className="h-full transition hover:shadow-v-shadow-md">
              <h2 className="text-lg font-semibold text-v-text">{card.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-v-text-subtle">
                {card.description}
              </p>
            </Card>
          </motion.div>
        ))}
      </div>

      <p className="mt-16 text-center text-xs font-medium uppercase tracking-wider text-v-text-subtle">
        Every Vote Counts.
      </p>
    </section>
  )
}
