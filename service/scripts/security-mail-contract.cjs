const assert = require('node:assert/strict')
const nodemailer = require('nodemailer')

async function main() {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  })
  const cases = [
    { to: 'Synthetic <reader@example.invalid>', expected: 'reader@example.invalid' },
    { to: '"quoted (comment)"@example.invalid', expected: '"quoted (comment)"@example.invalid' },
    { to: '"quoted\\"(comment)"@example.invalid', expected: '"quoted\\"(comment)"@example.invalid' },
    { to: { name: 'Synthetic (comment)', address: 'reader@example.invalid' }, expected: 'reader@example.invalid' },
  ]
  let checked = 0
  try {
    const hostileRecipients = [
      '"synthetic"@example.invalid(comment)attacker.invalid',
      '"synthetic"@example.invalid(comment)attacker.invalid(second)tail.invalid',
    ]
    for (const to of hostileRecipients) {
      const info = await transport.sendMail({
        from: 'sender@example.invalid',
        to,
        subject: 'Synthetic contract',
        text: 'Synthetic contract body',
      })
      assert.equal(info.envelope.to.length, 1)
      assert.equal(/@[^\r\n]*\s/.test(info.envelope.to[0]), false)
      checked += 1
    }
    for (const test of cases) {
      const info = await transport.sendMail({
        from: 'sender@example.invalid',
        to: test.to,
        subject: 'Synthetic contract',
        text: 'Synthetic contract body',
      })
      assert.deepEqual(info.envelope.to, [test.expected])
      assert.equal(info.envelope.from, 'sender@example.invalid')
      assert.ok(Buffer.isBuffer(info.message))
      checked += 1
    }
    const info = await transport.sendMail({
      from: { name: 'Synthetic', address: 'sender@example.invalid' },
      to: 'reader@example.invalid',
      cc: 'copy@example.invalid',
      bcc: 'private-copy@example.invalid',
      subject: 'Synthetic contract',
      text: 'Synthetic contract body',
      html: '<p>Synthetic contract body</p>',
    })
    assert.deepEqual(info.envelope.to, [
      'reader@example.invalid',
      'copy@example.invalid',
      'private-copy@example.invalid',
    ])
    assert.ok(info.message.toString('utf8').includes('Synthetic contract body'))
    checked += 1
    console.log(JSON.stringify({ contract: 'mail_parameters', checked_case_count: checked, passed: true }))
  } finally {
    transport.close()
  }
}

main().catch(() => {
  console.log(JSON.stringify({ contract: 'mail_parameters', passed: false, error_class: 'contract_execution_failed' }))
  process.exitCode = 1
})
