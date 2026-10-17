import { PageHeader } from '../../components/ui/Layout'
import { useRealtime } from '../../lib/useRealtime'
import { qk } from '../../lib/queryClient'
import { CalendarsSection } from './CalendarsSection'
import { AccountSection, AppearanceSection, InstallSection } from './DeviceSection'
import { InviteSection } from './InviteSection'
import { NotificationsSection } from './NotificationsSection'
import { HouseholdSection, ProfileSection } from './ProfileSection'

export default function SettingsPage() {
  // Sync status updates arrive as feed_events changes.
  useRealtime('feed_events', qk.feeds)
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader title="Settings" />
      <ProfileSection />
      <InviteSection />
      <NotificationsSection />
      <CalendarsSection />
      <HouseholdSection />
      <InstallSection />
      <AppearanceSection />
      <AccountSection />
    </div>
  )
}
