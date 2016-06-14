<?php

function printOwing() {
    $e = $this->orders->elements();
    $outstanding = 0;

    // print banner
    print("*****************************\n");
    print("****** Customer totals ******\n");
    print("*****************************\n");

    // print owings
    while ($e->hasMoreElements()) {
        $each = $e->nextElement();
        $outstanding += $each->getAmount();
    }

    // print details
    print("name: " . $this->name);
    print("amount: " . $outstanding);
}