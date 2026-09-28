<?php

namespace App\Providers;

use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Events\TokenAuthenticated;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Keep each session's device info current (Audit Log → Login Devices).
        // Sanctum saves last_used_at right after this event, so the filled
        // attributes go out in that same UPDATE - no extra query.
        Event::listen(TokenAuthenticated::class, function (TokenAuthenticated $e) {
            $request = request();
            $name = trim(substr((string) $request->header('X-Device-Name'), 0, 100));
            $e->token->forceFill(array_filter([
                'ip_address'  => $request->ip(),
                'user_agent'  => substr((string) $request->userAgent(), 0, 1000),
                'device_name' => $name,
            ], fn ($v) => $v !== ''));
        });
    }
}
