
import React from 'react';
import type { Expense, Load } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileSearch } from 'lucide-react';

type ExpensesTableProps = {
  expenses: Expense[];
  loads: Load[];
};

export function ExpensesTable({ expenses, loads }: ExpensesTableProps) {
  if (expenses.length === 0) {
    return (
      <div className="text-center py-10 bg-card rounded-lg shadow">
        <FileSearch className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No expenses recorded yet.</p>
        <p className="text-sm text-muted-foreground">Add an expense using the form above.</p>
      </div>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardContent className="p-0">
        <ScrollArea className="max-h-[500px]">
          <Table>
            <TableCaption>A list of your recent expenses.</TableCaption>
            <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <TableRow>
                <TableHead className="w-[150px]">Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right w-[120px]">Amount</TableHead>
                <TableHead>Associated Load</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map(expense => {
                const associatedLoad = expense.loadId ? loads.find(l => l.id === expense.loadId) : null;
                let loadIdentifier = 'N/A';
                if (associatedLoad) {
                  loadIdentifier = associatedLoad.loadNumber 
                    ? `${associatedLoad.loadNumber}: ${associatedLoad.origin} → ${associatedLoad.destination}`
                    : `${associatedLoad.origin} → ${associatedLoad.destination}`;
                }
                return (
                  <TableRow key={expense.id}>
                    <TableCell>{new Date(expense.date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{expense.category}</TableCell>
                    <TableCell className="text-right">${expense.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      {loadIdentifier}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
