<?php

use Illuminate\Support\Facades\Route;

use App\Http\Controllers\AdminDashboardController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\TrunkController;
use App\Http\Controllers\SipInviteController;
use App\Http\Controllers\LiveCallController;
use App\Http\Controllers\SystemHealthController;
use App\Http\Controllers\CdrController;
use App\Http\Controllers\DidRouteController;

Route::prefix('admin')->group(function () {

    # Dashboard
    Route::get('/dashboard', [AdminDashboardController::class, 'index'])->name('dashboard.index');
    Route::get('/dashboard/live', [AdminDashboardController::class, 'live'])->name('dashboard.live');

    # Customers
    Route::get('/customers', [CustomerController::class, 'index'])->name('customers.index');

    # Trunks
    Route::get('/trunks', [TrunkController::class, 'index'])->name('trunks.index')->middleware('auth:sanctum');
    Route::get('/trunks/create', [TrunkController::class, 'create'])->name('trunks.create')->middleware('auth:sanctum');
    Route::post('/trunks', [TrunkController::class, 'store'])->name('trunks.store')->middleware('auth:sanctum');
    Route::get('/trunks/{id}/edit', [TrunkController::class, 'edit'])->name('trunks.edit')->middleware('auth:sanctum');
    Route::put('/trunks/{id}', [TrunkController::class, 'update'])->name('trunks.update')->middleware('auth:sanctum');
    Route::delete('/trunks/{id}', [TrunkController::class, 'destroy'])->name('trunks.destroy')->middleware('auth:sanctum');

    # DID Routing
    Route::get('/dids', [DidRouteController::class, 'index'])->name('dids.index');
    Route::get('/dids/create', [DidRouteController::class, 'create'])->name('dids.create');
    Route::post('/dids', [DidRouteController::class, 'store'])->name('dids.store');
    Route::get('/dids/{id}/edit', [DidRouteController::class, 'edit'])->name('dids.edit');
    Route::put('/dids/{id}', [DidRouteController::class, 'update'])->name('dids.update');
    Route::delete('/dids/{id}', [DidRouteController::class, 'destroy'])->name('dids.destroy');

    # SIP Invites
    Route::get('/sip-invites', [SipInviteController::class, 'index'])->name('sipinvites.index');

    # CDR
    Route::get('/cdr', [CdrController::class, 'index'])->name('cdr.index');
    Route::get('/cdr/{id}', [CdrController::class, 'show'])->name('cdr.show');

    # Live Calls
    Route::get('/live-calls', [LiveCallController::class, 'index'])->name('livecalls.index');

    # System Health
    Route::get('/system-health', [SystemHealthController::class, 'index'])->name('systemhealth.index');
});
