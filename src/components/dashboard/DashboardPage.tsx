
import React from 'react';
import type { Load, Expense } from '@/types';
import { MetricCard } from './MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, AlertTriangle, TrendingUp, TrendingDown, ListChecks, BarChart3, Info } from 'lucide-react';
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
    const date = parseISO(dateString); // Handles 'YYYY-MM-DD' and full ISO strings
    // Using Monday as the start of the week.
    // Format as 'YYYY-MM-DD' for reliable sorting and unique keys.
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


export function DashboardPage({ loads, expenses }: DashboardPageProps) {
  const totalIncome = loads.reduce((sum, load) => sum + load.totalAgreedRate, 0);

  const totalLoadRelatedExpensesFromLoads = loads.reduce((sum, load) => {
    if (load.status === 'delivered' && load.expenses.calculated) {
      return sum + load.expenses.payroll + load.expenses.fuel + load.expenses.def + load.expenses.recurring;
    }
    return sum;
  }, 0);

  const totalOtherManualExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
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

  expenses.forEach(expense => {
    if (expense.date) {
      const weekKey = getWeekKey(expense.date);
      if (weekKey) {
        // Subtract manual expenses from profits for that week
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
    .map(({ name, value }) => ({ name, profit: value })); // Rename 'value' to 'profit' for consistency if Bar dataKey is 'profit'


  // --- Prepare data for Weekly Total Expenses chart ---
  const weeklyTotalExpensesAccumulator: Record<string, number> = {};

  loads.forEach(load => {
    if (load.status === 'delivered' && load.expenses.calculated && load.deliveryDateTime) {
      const weekKey = getWeekKey(load.deliveryDateTime);
      if (weekKey) {
        const loadCalculatedExpenses = load.expenses.payroll + load.expenses.fuel + load.expenses.def + load.expenses.recurring;
        weeklyTotalExpensesAccumulator[weekKey] = (weeklyTotalExpensesAccumulator[weekKey] || 0) + loadCalculatedExpenses;
      }
    }
  });

  expenses.forEach(expense => {
    if (expense.date) {
      const weekKey = getWeekKey(expense.date);
      if (weekKey) {
        weeklyTotalExpensesAccumulator[weekKey] = (weeklyTotalExpensesAccumulator[weekKey] || 0) + expense.amount;
      }
    }
  });

  const weeklyExpensesChartData = Object.entries(weeklyTotalExpensesAccumulator)
    .map(([weekKey, expenseValue]) => ({
      weekKey,
      name: formatWeekDisplay(weekKey),
      value: expenseValue,
    }))
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey))
    .map(({ name, value }) => ({ name, totalExpenses: value })); // Rename 'value' to 'totalExpenses'

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
            <p className="mt-2 italic">The charts below show weekly trends. "Weekly Total Expenses" sums all expenses for a given week. "Profit Trends" shows net profit per week.</p>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Weekly Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyExpensesChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyExpensesChartData} margin={{ left: 0, right:30, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} interval={0} />
                  <YAxis tickFormatter={(value) => `$${value}`} />
                  <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Total Expenses"]} />
                  <Bar dataKey="totalExpenses" fill="hsl(var(--primary))" barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground">No weekly expense data available.</p>
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
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={profitChartData} margin={{ left:0, right:30, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} interval={0} />
                  <YAxis tickFormatter={(value) => `$${value}`} />
                  <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Net Profit"]} />
                  <Legend verticalAlign="top" height={36}/>
                  <Bar dataKey="profit">
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

