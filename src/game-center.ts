import * as echarts from 'echarts/core'
import {LineChart} from 'echarts/charts'
import {AriaComponent, GridComponent, TooltipComponent} from 'echarts/components'
import {CanvasRenderer} from 'echarts/renderers'
import type {EChartsType} from 'echarts/core'
import type {GameEvent, GameState} from './core/game'
import {replayGameStory, type GameStoryPoint} from './core/story'

echarts.use([LineChart, AriaComponent, GridComponent, TooltipComponent, CanvasRenderer])

let fieldChart: EChartsType | null = null
let scoreChart: EChartsType | null = null
let lastRevision = -1
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function fieldOption(state: GameState, points: GameStoryPoint[]): echarts.EChartsCoreOption {
  const currentDrive = Math.max(...points.map((point) => point.drive))
  const drivePoints = points.filter((point) => point.drive === currentDrive)
  const data = (drivePoints.length ? drivePoints : points).map((point) => [point.ballOn, .5, point.label, point.seq])

  return {
    animationDuration: reduceMotion ? 0 : 650,
    animationEasing: 'cubicOut',
    backgroundColor: 'transparent',
    aria: {enabled: true, decal: {show: false}},
    grid: {left: 14, right: 14, top: 14, bottom: 30, containLabel: false},
    tooltip: {
      trigger: 'item',
      backgroundColor: '#080a0fee',
      borderColor: '#ffffff22',
      textStyle: {color: '#f8fafc', fontSize: 11},
      formatter: (params: any) => `<b>${params.value[2]}</b><br/>Ball on ${params.value[0]}`,
    },
    xAxis: {
      type: 'value', min: 0, max: 100, interval: 10,
      axisLine: {show: false}, axisTick: {show: false},
      axisLabel: {
        color: '#7f8a83', fontSize: 9, margin: 7,
        formatter: (value: number) => value === 50 ? '50' : String(value <= 50 ? value : 100 - value),
      },
      splitLine: {show: true, lineStyle: {color: '#ffffff17', width: 1}},
      splitArea: {show: true, areaStyle: {color: ['#183723','#1c4028']}},
    },
    yAxis: {type: 'value', min: 0, max: 1, show: false},
    series: [{
      type: 'line',
      data,
      symbol: 'circle', symbolSize: 12,
      showSymbol: true,
      lineStyle: {width: 4, color: '#ff6a24', shadowColor: '#ff5b1877', shadowBlur: 12},
      itemStyle: {color: '#fff', borderColor: '#ff6a24', borderWidth: 4},
      emphasis: {scale: 1.35},
      connectNulls: false,
    }],
  }
}

function scoreOption(state: GameState, points: GameStoryPoint[]): echarts.EChartsCoreOption {
  const scoring = points.filter((point, index) => index === 0 || point.homeScore !== points[index - 1].homeScore || point.awayScore !== points[index - 1].awayScore)
  const categories = scoring.map((point) => point.seq === 0 ? 'START' : `#${point.seq}`)
  return {
    animationDuration: reduceMotion ? 0 : 700,
    animationEasing: 'cubicOut',
    backgroundColor: 'transparent',
    aria: {enabled: true, decal: {show: false}},
    grid: {left: 28, right: 12, top: 12, bottom: 22},
    tooltip: {trigger: 'axis', backgroundColor: '#080a0fee', borderColor: '#ffffff22', textStyle: {color: '#f8fafc', fontSize: 11}},
    xAxis: {type: 'category', data: categories, boundaryGap: false, axisLine: {lineStyle: {color: '#ffffff18'}}, axisTick: {show: false}, axisLabel: {color: '#6f7884', fontSize: 8}},
    yAxis: {type: 'value', min: 0, minInterval: 1, axisLine: {show: false}, axisTick: {show: false}, axisLabel: {color: '#6f7884', fontSize: 8}, splitLine: {lineStyle: {color: '#ffffff0c'}}},
    series: [
      {name: state.home.short, type: 'line', step: 'end', data: scoring.map((point) => point.homeScore), symbolSize: 7, lineStyle: {width: 3, color: '#ff6a24'}, itemStyle: {color: '#ff6a24'}, areaStyle: {color: '#ff6a2412'}},
      {name: state.away.short, type: 'line', step: 'end', data: scoring.map((point) => point.awayScore), symbolSize: 7, lineStyle: {width: 2, color: '#cbd5e1'}, itemStyle: {color: '#cbd5e1'}},
    ],
  }
}

export async function renderGameCenter(state: GameState, eventsUrl: string) {
  if (state.revision === lastRevision && fieldChart && scoreChart) return
  const response = await fetch(eventsUrl)
  if (!response.ok) return
  const payload = await response.json() as {events: GameEvent[]}
  const points = replayGameStory(payload.events)

  const fieldEl = document.querySelector<HTMLElement>('[data-field-chart]')
  const scoreEl = document.querySelector<HTMLElement>('[data-score-chart]')
  const fieldSummaryEl = document.querySelector<HTMLElement>('[data-field-summary]')
  const scoreSummaryEl = document.querySelector<HTMLElement>('[data-score-summary]')
  const dataEl = document.querySelector<HTMLElement>('[data-chart-data]')
  if (!fieldEl || !scoreEl) return

  const currentDrive=Math.max(...points.map((point)=>point.drive))
  const drivePoints=points.filter((point)=>point.drive===currentDrive)
  const latest=drivePoints.at(-1) ?? points.at(-1)
  const fieldSummary=latest ? `${state.possession === 'home' ? state.home.short : state.away.short} possession, ball on ${latest.ballOn}. Current drive has ${Math.max(0,drivePoints.length-1)} recorded movement events.` : 'No drive data yet.'
  const scoreSummary=`${state.home.short} ${state.home.score}, ${state.away.short} ${state.away.score}.`
  fieldEl.setAttribute('aria-label',`Drive map. ${fieldSummary}`)
  scoreEl.setAttribute('aria-label',`Scoring timeline. ${scoreSummary}`)
  if(fieldSummaryEl) fieldSummaryEl.textContent=fieldSummary
  if(scoreSummaryEl) scoreSummaryEl.textContent=scoreSummary
  if(dataEl){
    const rows=points.filter((point,index)=>index===0||point.label!==points[index-1].label).slice(-12)
    dataEl.innerHTML=`<table><caption>Recent game events</caption><thead><tr><th scope="col">Event</th><th scope="col">Ball</th><th scope="col">Score</th></tr></thead><tbody>${rows.map(point=>`<tr><td>${point.label}</td><td>${point.ballOn}</td><td>${state.home.short} ${point.homeScore}–${point.awayScore} ${state.away.short}</td></tr>`).join('')}</tbody></table>`
  }

  fieldChart ??= echarts.init(fieldEl, undefined, {renderer: 'canvas'})
  scoreChart ??= echarts.init(scoreEl, undefined, {renderer: 'canvas'})
  fieldChart.setOption(fieldOption(state, points), true)
  scoreChart.setOption(scoreOption(state, points), true)
  lastRevision = state.revision
}

export function resizeGameCenter() {
  fieldChart?.resize()
  scoreChart?.resize()
}
