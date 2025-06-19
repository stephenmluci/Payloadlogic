
import React from 'react';
import type { Load, Expense } from '@/types';
import { MetricCard } from './MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, AlertTriangle, TrendingUp, TrendingDown, ListChecks, BarChart3, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

type DashboardPageProps = {
  loads: Load[];
  expenses: Expense[];
};

export function DashboardPage({ loads, expenses }: DashboardPageProps) {
  const totalIncome = loads.reduce((sum, load) => sum + load.totalAgreedRate, 0);

  // Calculate total for "Load-Related (Calculated)" for the metric card
  const totalLoadRelatedExpensesFromLoads = loads.reduce((sum, load) => {
    if (load.status === 'delivered' && load.expenses.calculated) {
      return sum + load.expenses.payroll + load.expenses.fuel + load.expenses.def + load.expenses.recurring;
    }
    return sum;
  }, 0);

  const totalOtherManualExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalCalculatedExpenses = totalLoadRelatedExpensesFromLoads + totalOtherManualExpenses;
  
  const netProfit = totalIncome - totalCalculatedExpenses;

  // Prepare data for the expense breakdown chart (itemized)
  const expenseByCategoryForChart: Record<string, number> = {};

  // Process manually logged expenses for the chart
  expenses.forEach(expense => {
    expenseByCategoryForChart[expense.category] = (expenseByCategoryForChart[expense.category] || 0) + expense.amount;
  });

  // Process calculated expenses from delivered loads for the chart, itemized
  loads.forEach(load => {
    if (load.status === 'delivered' && load.expenses.calculated) {
      if (load.expenses.payroll > 0) {
        expenseByCategoryForChart['Calculated Payroll'] = (expenseByCategoryForChart['Calculated Payroll'] || 0) + load.expenses.payroll;
      }
      if (load.expenses.fuel > 0) {
        expenseByCategoryForChart['Calculated Fuel'] = (expenseByCategoryForChart['Calculated Fuel'] || 0) + load.expenses.fuel;
      }
      if (load.expenses.def > 0) {
        expenseByCategoryForChart['Calculated DEF'] = (expenseByCategoryForChart['Calculated DEF'] || 0) + load.expenses.def;
      }
      if (load.expenses.recurring > 0) {
        expenseByCategoryForChart['Calculated Recurring'] = (expenseByCategoryForChart['Calculated Recurring'] || 0) + load.expenses.recurring;
      }
    }
  });

  const expenseChartData = Object.entries(expenseByCategoryForChart)
    .filter(([, value]) => value > 0) // Only include categories with an amount greater than 0
    .map(([name, value]) => ({ name, value }));


  // Prepare data for Profit Trends chart (remains the same)
  const monthlyProfitData: { month: string, profit: number }[] = loads.reduce((acc, load) => {
    if (load.status === 'delivered' && load.expenses.calculated) {
      const month = "Current Month"; 
      const loadProfit = load.totalAgreedRate - (load.expenses.payroll + load.expenses.fuel + load.expenses.def + load.expenses.recurring);
      
      const existingEntry = acc.find(entry => entry.month === month);
      if (existingEntry) {
        existingEntry.profit += loadProfit;
      } else {
        acc.push({ month, profit: loadProfit });
      }
    }
    return acc;
  }, [] as { month: string, profit: number }[]);
  
  // Adjust profit data for other manual expenses
  if (monthlyProfitData.length > 0 && totalOtherManualExpenses > 0) {
    monthlyProfitData[0].profit -= totalOtherManualExpenses;
  } else if (monthlyProfitData.length === 0 && totalOtherManualExpenses > 0) { // If no loads but there are manual expenses
     monthlyProfitData.push({ month: "Adjustments", profit: -totalOtherManualExpenses});
  }


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
            <p className="mt-2 italic">The 'Expense Category Breakdown' chart below specifically details the categories of your expenses, not your income. Calculated expenses from loads (like 'Calculated Payroll') are itemized.</p>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Expense Category Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expenseChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={expenseChartData} layout="vertical" margin={{ left: 30, right:30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number"  tickFormatter={(value) => `$${value}`}/>
                  <YAxis dataKey="name" type="category" width={120} interval={0} /> {/* Increased width for longer labels */}
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground">No expense data available.</p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Profit Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
             {monthlyProfitData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyProfitData} margin={{ left:0, right:30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => `$${value}`} />
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Legend />
                  <Bar dataKey="profit">
                    {monthlyProfitData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground">No profit data available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
