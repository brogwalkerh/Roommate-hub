import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SelectField, TextField } from '../../components/ui/Field'
import { Panel, SectionLabel } from '../../components/ui/Layout'
import { useToast } from '../../components/ui/Toast'
import {
  useHousehold,
  useMembers,
  useUpdateHousehold,
  useUpdateMyProfile,
  type Household,
  type Profile,
} from '../../household/useHousehold'
import { browserTimeZone } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'

const PERSON_COLORS = ['#2c5ea6', '#b0452f', '#2b6a5b', '#7a4fa3', '#a16207', '#be185d', '#0e7490', '#4b5563']

export function ProfileSection() {
  const { me } = useMembers()
  // Remount the form when the saved profile changes so it starts from the latest values.
  return me ? <ProfileForm key={me.updated_at} me={me} /> : null
}

function ProfileForm({ me }: { me: Profile }) {
  const update = useUpdateMyProfile()
  const { toast } = useToast()
  const [name, setName] = useState(me.display_name)
  const [color, setColor] = useState(me.color)

  const dirty = name.trim() !== me.display_name || color !== me.color

  async function save() {
    try {
      await update.mutateAsync({ display_name: name.trim(), color })
      toast('Profile saved.')
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' })
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="profile-heading">
      <SectionLabel>
        <span id="profile-heading">You</span>
      </SectionLabel>
      <Panel className="flex flex-col gap-4 p-4">
        <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Your color</legend>
          <p className="mb-2 text-sm text-muted">Used for your events, reminders and bills.</p>
          <div className="flex flex-wrap gap-2">
            {PERSON_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`size-9 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
        <div>
          <Button variant="primary" disabled={!dirty || !name.trim()} loading={update.isPending} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </Panel>
    </section>
  )
}

export function HouseholdSection() {
  const { data: household } = useHousehold()
  return household ? <HouseholdForm key={household.updated_at} household={household} /> : null
}

function HouseholdForm({ household }: { household: Household }) {
  const update = useUpdateHousehold()
  const { toast } = useToast()
  const [name, setName] = useState(household.name)
  const [timezone, setTimezone] = useState(household.timezone)
  const zones = Intl.supportedValuesOf('timeZone')
  const deviceZone = browserTimeZone()

  const dirty = name.trim() !== household.name || timezone !== household.timezone

  async function save() {
    try {
      await update.mutateAsync({ name: name.trim(), timezone })
      toast('Household saved.')
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' })
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="household-heading">
      <SectionLabel>
        <span id="household-heading">Household</span>
      </SectionLabel>
      <Panel className="flex flex-col gap-4 p-4">
        <TextField label="Household name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <SelectField
          label="Time zone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          hint="Repeating reminders, recurring bills and morning notifications follow this time zone."
        >
          {!zones.includes(timezone) && timezone && <option value={timezone}>{timezone}</option>}
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
            </option>
          ))}
        </SelectField>
        {household.timezone !== deviceZone && timezone !== deviceZone && (
          <button type="button" className="self-start text-sm text-accent underline underline-offset-2" onClick={() => setTimezone(deviceZone)}>
            Use this device’s time zone ({deviceZone.replace(/_/g, ' ')})
          </button>
        )}
        <div>
          <Button variant="primary" disabled={!dirty || !name.trim()} loading={update.isPending} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </Panel>
    </section>
  )
}
