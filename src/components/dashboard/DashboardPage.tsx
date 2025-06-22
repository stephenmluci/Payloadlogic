
import React from 'react';
import type { Load, Expense } from '@/types';
import { MetricCard } from './MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, AlertTriangle, TrendingUp, TrendingDown, ListChecks, BarChart3, Info, Palette } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { startOfWeek, format, parseISO } from 'date-fns';

type DashboardPageProps = {
  loads: Load[];
  expenses: Expense[];
};

// Helper function to get the start of the week as a formatted string key
const getWeekKey = (dateString?: string): string | null => {
  if (!dateString) return null;
  try {
    const date = parseISO(dateString); 
    return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  } catch (e) {
    console.warn("Invalid date for week processing:", dateString, e);
    return null;
  }
};

// Helper function to format the week key for display
const formatWeekDisplay = (weekKey: string): string => {
  try {
    return `Wk of ${format(parseISO(weekKey), 'MMM d')}`;
  } catch (e) {
    return "Invalid Week";
  }
};

const chartColors = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  // Add more if needed, or cycle through them
  'hsl(var(--primary))',
  'hsl(var(--accent))',
];


export function DashboardPage({ loads, expenses }: DashboardPageProps) {
  const totalIncome = loads.reduce((sum, load) => sum + load.totalAgreedRate, 0);

  const totalLoadRelatedExpensesFromLoads = loads.reduce((sum, load) => {
    if (load.status === 'delivered' && load.expenses.calculated) {
      return sum + load.expenses.payroll + load.expenses.fuel + load.expenses.def + load.expenses.recurring;
    }
    return sum;
  }, 0);

  // Only sum up manual expenses that are NOT associated with a load.
  // Load-associated manual expenses are already accounted for in the load.expenses object.
  const totalOtherManualExpenses = expenses.reduce((sum, expense) => {
    if (!expense.loadId) {
      return sum + expense.amount;
    }
    return sum;
  }, 0);

  const totalCalculatedExpenses = totalLoadRelatedExpensesFromLoads + totalOtherManualExpenses;
  
  const netProfit = totalIncome - totalCalculatedExpenses;

  // --- Prepare data for Weekly Profit Trends chart ---
  const weeklyProfitAccumulator: Record<string, number> = {};

  loads.forEach(load => {
    if (load.status === 'delivered' && load.expenses.calculated && load.deliveryDateTime) {
      const weekKey = getWeekKey(load.deliveryDateTime);
      if (weekKey) {
        const loadProfit = load.totalAgreedRate - (load.expenses.payroll + load.expenses.fuel + load.expenses.def + load.expenses.recurring);
        weeklyProfitAccumulator[weekKey] = (weeklyProfitAccumulator[weekKey] || 0) + loadProfit;
      }
    }
  });
  
  // Subtract general (non-load) expenses from weekly profit
  expenses.forEach(expense => {
    if (!expense.loadId && expense.date) {
      const weekKey = getWeekKey(expense.date);
      if (weekKey) {
        weeklyProfitAccumulator[weekKey] = (weeklyProfitAccumulator[weekKey] || 0) - expense.amount;
      }
    }
  });
  
  const profitChartData = Object.entries(weeklyProfitAccumulator)
    .map(([weekKey, profitValue]) => ({
      weekKey, 
      name: formatWeekDisplay(weekKey),
      value: profitValue,
    }))
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey)) 
    .map(({ name, value }) => ({ name, profit: value }));


  // --- Prepare data for Itemized Weekly Expenses chart ---
  const itemizedWeeklyExpenseDataAggregator: Record<string, Record<string, number>> = {};
  const allExpenseCategories = new Set<string>();

  const addExpenseToAggregator = (weekKey: string, category: string, amount: number) => {
    if (!itemizedWeeklyExpenseDataAggregator[weekKey]) {
      itemizedWeeklyExpenseDataAggregator[weekKey] = {};
    }
    itemizedWeeklyExpenseDataAggregator[weekKey][category] = (itemizedWeeklyExpenseDataAggregator[weekKey][category] || 0) + amount;
    allExpenseCategories.add(category);
  };

  loads.forEach(load => {
    if (load.status === 'delivered' && load.expenses.calculated && load.deliveryDateTime) {
      const weekKey = getWeekKey(load.deliveryDateTime);
      if (weekKey) {
        if (load.expenses.payroll > 0) addExpenseToAggregator(weekKey, 'Calc: Payroll', load.expenses.payroll);
        if (load.expenses.fuel > 0) addExpenseToAggregator(weekKey, 'Calc: Fuel', load.expenses.fuel);
        if (load.expenses.def > 0) addExpenseToAggregator(weekKey, 'Calc: DEF', load.expenses.def);
        if (load.expenses.recurring > 0) addExpenseToAggregator(weekKey, 'Calc: Recurring', load.expenses.recurring);
      }
    }
  });

  // Only process manual expenses that are NOT associated with a load, as the others are already accounted for.
  expenses.forEach(expense => {
    if (!expense.loadId && expense.date && expense.amount > 0) {
      const weekKey = getWeekKey(expense.date);
      if (weekKey) {
        addExpenseToAggregator(weekKey, `Manual: ${expense.category}`, expense.amount);
      }
    }
  });

  const sortedExpenseCategories = Array.from(allExpenseCategories).sort();
  const categoryColorMap: Record<string, string> = {};
  sortedExpenseCategories.forEach((category, index) => {
    categoryColorMap[category] = chartColors[index % chartColors.length];
  });
  
  const itemizedWeeklyExpensesChartData = Object.entries(itemizedWeeklyExpenseDataAggregator)
    .map(([weekKey, weeklyCategoryTotals]) => {
      const weekData: Record<string, any> = {
        weekKey,
        name: formatWeekDisplay(weekKey),
      };
      sortedExpenseCategories.forEach(category => {
        weekData[category] = weeklyCategoryTotals[category] || 0;
      });
      return weekData;
    })
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey));


  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-3xl font-bold font-headline">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <MetricCard 
          title="Total Income" 
          value={`$${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={<DollarSign className="h-5 w-5 text-muted-foreground" />}
        />
        <MetricCard 
          title="Total Calculated Expenses" 
          value={`$${totalCalculatedExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={<AlertTriangle className="h-5 w-5 text-muted-foreground" />}
        />
        <MetricCard 
          title="Net Profit" 
          value={`$${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={netProfit >= 0 ? <TrendingUp className="h-5 w-5 text-green-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}
          valueClassName={netProfit >= 0 ? 'text-green-600' : 'text-red-600'}
        />
      </div>

      <Card className="bg-card shadow">
        <CardHeader>
            <CardTitle className="text-lg flex items-center"><Info className="h-5 w-5 mr-2 text-primary" /> How to Read These Metrics</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
            <p><strong>Total Income:</strong> Gross income from all your loads (sum of all load 'Total Agreed Rates').</p>
            <p><strong>Total Calculated Expenses:</strong> Combines direct load costs (like payroll, fuel for delivered loads) and other general business expenses you've logged.</p>
            <p><strong>Net Profit:</strong> The difference between Total Income and Total Calculated Expenses.</p>
            <p className="mt-2 italic">The "Weekly Itemized Expense Breakdown" chart shows stacked bars for each week, detailing different expense categories. "Profit Trends" shows net profit per week.</p>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" /> {/* Changed icon */}
              Weekly Itemized Expense Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {itemizedWeeklyExpensesChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={itemizedWeeklyExpensesChartData} margin={{ left: 0, right:30, top: 5, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} interval={0} />
                  <YAxis tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
                    contentStyle={{backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend wrapperStyle={{paddingTop: '10px'}} />
                  {sortedExpenseCategories.map((category) => (
                    <Bar 
                      key={category} 
                      dataKey={category} 
                      stackId="weeklyExpenses" 
                      fill={categoryColorMap[category]} 
                      name={category} // Used by Legend and Tooltip
                      barSize={30}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground">No weekly expense data available for itemized breakdown.</p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Weekly Profit Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
             {profitChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={profitChartData} margin={{ left:0, right:30, top: 5, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} interval={0} />
                  <YAxis tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Net Profit"]}
                    contentStyle={{backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend verticalAlign="top" height={36}/>
                  <Bar dataKey="profit" barSize={30}>
                    {profitChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground">No weekly profit data available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
