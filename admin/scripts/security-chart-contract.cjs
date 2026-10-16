const assert = require('node:assert/strict')
const echarts = require('echarts')

function main() {
  const chart = echarts.init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 320,
    height: 180,
  })
  let checked = 0
  try {
    chart.setOption({
      animation: false,
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['Synthetic first', 'Synthetic second'] },
      yAxis: { type: 'value' },
      series: [{ id: 'synthetic-series', name: 'Synthetic', type: 'bar', data: [1, 2] }],
    })
    const option = chart.getOption()
    assert.equal(option.series[0].type, 'bar')
    assert.deepEqual(option.series[0].data, [1, 2])
    assert.equal(option.tooltip[0].trigger, 'axis')
    assert.ok(chart.renderToSVGString().includes('<svg'))
    checked += 1

    chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 0 })
    chart.dispatchAction({ type: 'hideTip' })
    checked += 1

    chart.setOption({ series: [{ id: 'synthetic-series', data: [3, 4] }] })
    assert.deepEqual(chart.getOption().series[0].data, [3, 4])
    checked += 1

    chart.resize({ width: 640, height: 360 })
    assert.equal(chart.getWidth(), 640)
    assert.equal(chart.getHeight(), 360)
    checked += 1

    const hostileLabel = '<img/src=x/onerror=alert(1)>'
    chart.setOption({
      xAxis: { data: [hostileLabel, 'Synthetic second'] },
      series: [{ id: 'synthetic-series', name: hostileLabel, data: [3, 4] }],
    })
    const svg = chart.renderToSVGString()
    assert.equal(/<(?:img|script)\b[^>]*(?:onerror|>alert)/i.test(svg), false)
    assert.equal(/<[a-z][^>]*[\s/](?:onerror|onload)\s*=/i.test(svg), false)
    checked += 1
  } finally {
    chart.dispose()
  }
  assert.equal(chart.isDisposed(), true)
  checked += 1
  console.log(JSON.stringify({
    contract: 'chart_options',
    checked_case_count: checked,
    browser_tooltip_xss_verified: false,
    passed: true,
  }))
}

try {
  main()
} catch {
  console.log(JSON.stringify({ contract: 'chart_options', passed: false, error_class: 'contract_execution_failed' }))
  process.exitCode = 1
}
