import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pencil, Trash2 } from 'lucide-react'
import { ActionMenu } from './ActionMenu'

function setup() {
  const onRename = vi.fn()
  const onDelete = vi.fn()
  render(
    <ActionMenu
      label="Actions for lease.pdf"
      items={[
        { label: 'Rename', icon: <Pencil />, onSelect: onRename },
        { label: 'Delete', icon: <Trash2 />, onSelect: onDelete, tone: 'danger' },
      ]}
    />,
  )
  return { onRename, onDelete, user: userEvent.setup() }
}

describe('ActionMenu', () => {
  it('starts closed and opens with the first item focused', async () => {
    const { user } = setup()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: 'Actions for lease.pdf' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus()
  })

  it('runs the chosen action and closes', async () => {
    const { user, onRename, onDelete } = setup()
    await user.click(screen.getByRole('button', { name: 'Actions for lease.pdf' }))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('moves with the arrow keys and wraps around', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Actions for lease.pdf' }))
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
  })

  it('closes on Escape and returns focus to the button', async () => {
    const { user } = setup()
    const trigger = screen.getByRole('button', { name: 'Actions for lease.pdf' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes when tapping outside', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Actions for lease.pdf' }))
    await user.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
