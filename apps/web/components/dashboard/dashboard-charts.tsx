"use client";

import ReactECharts from "echarts-for-react";

interface DashboardChartsProps {
  distribution: Array<{ label: string; count: number }>;
  capabilityAverages: Array<number | null>;
  cycleTrends: Array<{ cycleId: string; cycleName: string; weightedAverage: number | null }>;
}

const capabilityNames = ["方案销售", "高层对话", "资源调度", "商业敏感度", "技术深度", "销售纪律", "成长心态"];

export function DashboardCharts({ distribution, capabilityAverages, cycleTrends }: DashboardChartsProps) {
  return (
    <div className="chart-grid">
      <section aria-labelledby="distribution-heading">
        <h2 id="distribution-heading">分数分布</h2>
        <p>{distribution.map((item) => `${item.label}：${item.count} 人`).join("；")}</p>
        <ReactECharts style={{ height: 280 }} option={{
          animationDuration: 450,
          color: ["#087f72"],
          grid: { left: 42, right: 20, top: 20, bottom: 36 },
          xAxis: { type: "category", data: distribution.map((item) => item.label), axisLabel: { color: "#42515a" } },
          yAxis: { type: "value", minInterval: 1, name: "人数" },
          tooltip: { trigger: "axis" },
          series: [{ type: "bar", data: distribution.map((item) => item.count), barMaxWidth: 46 }],
        }} />
      </section>
      <section aria-labelledby="capability-heading">
        <h2 id="capability-heading">七项能力团队均分</h2>
        <p>{capabilityNames.map((name, index) => `${name} ${capabilityAverages[index]?.toFixed(1) ?? "--"}`).join("；")}</p>
        <ReactECharts style={{ height: 300 }} option={{
          animationDuration: 450,
          color: ["#0067b8"],
          tooltip: {},
          radar: { indicator: capabilityNames.map((name) => ({ name, max: 5 })), radius: "64%", axisName: { color: "#344550" }, splitArea: { areaStyle: { color: ["#f5f8f8", "#eaf2f2"] } } },
          series: [{ type: "radar", data: [{ value: capabilityAverages.map((value) => value ?? 0), name: "团队均分", areaStyle: { opacity: .16 } }] }],
        }} />
      </section>
      <section className="wide-chart" aria-labelledby="trend-heading">
        <h2 id="trend-heading">周期趋势</h2>
        <p>{cycleTrends.length ? cycleTrends.map((item) => `${item.cycleName} ${item.weightedAverage?.toFixed(1) ?? "--"}`).join("；") : "暂无跨周期数据。"}</p>
        <ReactECharts style={{ height: 260 }} option={{
          animationDuration: 450,
          color: ["#bf4a3a"],
          grid: { left: 42, right: 20, top: 20, bottom: 42 },
          xAxis: { type: "category", data: cycleTrends.map((item) => item.cycleName) },
          yAxis: { type: "value", min: 1, max: 5 },
          tooltip: { trigger: "axis" },
          series: [{ type: "line", smooth: false, symbolSize: 9, data: cycleTrends.map((item) => item.weightedAverage) }],
        }} />
      </section>
    </div>
  );
}
