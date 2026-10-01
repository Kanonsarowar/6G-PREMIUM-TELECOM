<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resellers log in with the same Sanctum tokens as staff, and almost every
 * admin route only checks auth:sanctum. So instead of guarding each admin
 * route, a reseller token is denied everywhere except an explicit allowlist:
 * the reseller portal and their own auth/session routes.
 */
class RestrictResellerAccess
{
    private const RESELLER_ALLOWED = [
        'api/v1/portal',
        'api/v1/portal/*',
        'api/v1/auth/me',
        'api/v1/auth/logout',
        'api/v1/auth/sessions',
        'api/v1/auth/sessions/*',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->bearerToken() ? auth('sanctum')->user() : null;
        if (!$user || ($user->role ?? '') !== 'reseller') return $next($request);

        if (($user->status ?? 'active') !== 'active' && !$request->is('api/v1/auth/logout'))
            return response()->json(['message' => 'Your account is '.$user->status.'. Please contact support.'], 403);

        if (!$request->is(...self::RESELLER_ALLOWED))
            return response()->json(['message' => 'Forbidden'], 403);

        return $next($request);
    }
}
