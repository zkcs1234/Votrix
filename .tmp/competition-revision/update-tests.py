from pathlib import Path
p=Path('frontend/src/pages/organizer/competition/CompetitionEventFormPage.test.jsx');s=p.read_text(encoding='utf-8')
s=s.replace('events/:eventId/workspace','events/:eventId/categories').replace('Created workspace','Created categories')
s=s.replace("await screen.findByRole('button', { name: 'Create & continue' })", "await screen.findByRole('button', { name: 'Next: Competition Type' })",1)
a=s.index("it('footer validates");b=s.index("it('failed draft",a)
s=s[:a]+'''async function competitionType() {
  await branding()
  fireEvent.click(screen.getByRole('button', { name: 'Next: Competition Type' }))
  await screen.findByLabelText(/Competition type/)
  fireEvent.change(screen.getByLabelText(/Competition type/), {target:{value:'dance'}})
}
it('competition type is a separate required third step and validates a custom type before parent creation', async () => {
  open(); fillDetails(); await branding()
  expect(screen.queryByLabelText(/Competition type/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', {name:'Next: Competition Type'}))
  await screen.findByLabelText(/Competition type/)
  fireEvent.change(screen.getByLabelText(/Competition type/), { target: { value: '__other__' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next: Competitions / Categories' }))
  await screen.findByText('Enter a competition type.')
  expect(draftService.publishDraft).not.toHaveBeenCalled()
})
'''+s[b:]
s=s.replace("name: 'Back: Details'", "name: 'Back: Event Details'")
s=s.replace("name: 'Create & continue'", "name: 'Next: Competitions / Categories'").replace("name:'Create & continue'", "name:'Next: Competitions / Categories'")
s=s.replace('await branding()\n  fireEvent.click', 'await competitionType()\n  fireEvent.click')
s=s.replace("open(); fillDetails(); await branding()\n  const create", "open(); fillDetails(); await competitionType()\n  const create")
s=s.replace("open('/organizer/competition/events/new/branding')\n  fireEvent.click(screen.getByRole('button', { name: 'Next: Competitions / Categories' }))", "open('/organizer/competition/events/new/branding')\n  fireEvent.click(screen.getByRole('button', { name: 'Next: Competition Type' }))")
s=s.replace('fillDetails();await branding();fireEvent.click', 'fillDetails();await competitionType();fireEvent.click')
p.write_text(s,encoding='utf-8')
