import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UploadItem } from './hooks'
import { UploadTray } from './UploadTray'

const item = (n: number, status: UploadItem['status'], extra: Partial<UploadItem> = {}): UploadItem => ({
  id: `id-${n}`,
  file: new File(['x'.repeat(2048)], `file-${n}.pdf`),
  folder: 'Lease',
  status,
  error: null,
  ...extra,
})

function setup(items: UploadItem[]) {
  const handlers = { onRetry: vi.fn(), onDismiss: vi.fn(), onClearFinished: vi.fn() }
  render(<UploadTray items={items} {...handlers} />)
  return { ...handlers, user: userEvent.setup() }
}

describe('UploadTray', () => {
  it('renders nothing when there are no uploads', () => {
    const { container } = render(
      <UploadTray items={[]} onRetry={vi.fn()} onDismiss={vi.fn()} onClearFinished={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a status for every file', () => {
    setup([
      item(1, 'queued'),
      item(2, 'uploading'),
      item(3, 'done'),
      item(4, 'failed', { error: 'That file is over the 50 MB limit.' }),
    ])
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('file-1.pdf')
    expect(rows[0]).toHaveTextContent('Waiting')
    expect(rows[1]).toHaveTextContent('Uploading…')
    expect(rows[2]).toHaveTextContent('2 KB · Added to Lease')
    expect(rows[3]).toHaveTextContent('That file is over the 50 MB limit.')
    expect(screen.getByRole('heading', { name: 'Uploading 2 files' })).toBeInTheDocument()
  })

  it('names Unfiled uploads plainly', () => {
    setup([item(1, 'done', { folder: '' })])
    expect(screen.getByRole('listitem')).toHaveTextContent('Added to Unfiled')
    expect(screen.getByRole('heading', { name: 'Upload finished' })).toBeInTheDocument()
  })

  it('retries and dismisses only where it makes sense', async () => {
    const { user, onRetry, onDismiss, onClearFinished } = setup([
      item(1, 'uploading'),
      item(2, 'failed', { error: 'Boom' }),
    ])
    const [uploading, failed] = screen.getAllByRole('listitem')
    expect(within(uploading).queryByRole('button')).toBeNull()

    await user.click(within(failed).getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledWith('id-2')
    await user.click(within(failed).getByRole('button', { name: 'Dismiss file-2.pdf' }))
    expect(onDismiss).toHaveBeenCalledWith('id-2')
    await user.click(screen.getByRole('button', { name: 'Clear finished uploads' }))
    expect(onClearFinished).toHaveBeenCalledTimes(1)
  })

  it('hides Clear while everything is still running', () => {
    setup([item(1, 'queued'), item(2, 'uploading')])
    expect(screen.queryByRole('button', { name: 'Clear finished uploads' })).toBeNull()
  })

  it('says when some files did not upload', () => {
    setup([item(1, 'done'), item(2, 'failed', { error: 'Boom' })])
    expect(screen.getByRole('heading', { name: 'Some files didn’t upload' })).toBeInTheDocument()
  })
})
